import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_ADS_API_VERSION = 'v18';

/**
 * Refresh Google OAuth token if expired. Returns the current valid access token.
 */
export async function refreshGoogleTokenIfNeeded(
  userId: string,
  config: Record<string, unknown>
): Promise<string> {
  const expiresAt = config.token_expires_at as string | undefined;
  const accessToken = config.google_access_token as string | undefined;
  const refreshToken = config.refresh_token as string | undefined;

  if (!accessToken) throw new Error('No Google access token found');

  // If not expired, return current token
  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 60000) {
    return accessToken;
  }

  // Need to refresh
  if (!refreshToken) throw new Error('No refresh token available');

  const clientId = config.client_id as string;
  const clientSecret = config.client_secret as string;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || 'Unknown error'}`);
  }

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Update stored tokens (api_key stays in sync with access token)
  await supabaseAdmin
    .from('platform_integrations')
    .update({
      api_key: data.access_token,
      config: {
        ...config,
        google_access_token: data.access_token,
        token_expires_at: newExpiresAt,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'google_ads');

  return data.access_token;
}

/**
 * Make an authenticated request to the Google Ads REST API.
 */
export async function makeGoogleAdsRequest(
  accessToken: string,
  developerToken: string,
  customerId: string,
  path: string,
  options: { method?: string; body?: any; loginCustomerId?: string } = {}
): Promise<any> {
  const { method = 'GET', body, loginCustomerId } = options;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };

  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/${path}`;

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await resp.json();
  if (!resp.ok) {
    const errorMsg = data.error?.message
      || data[0]?.error?.message
      || JSON.stringify(data);
    throw new Error(`Google Ads API error: ${errorMsg}`);
  }

  return data;
}

/**
 * List accessible Google Ads customer accounts.
 */
export async function listAccessibleCustomers(
  accessToken: string,
  developerToken: string
): Promise<{ customerId: string; descriptiveName: string }[]> {
  const resp = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Failed to list customers: ${data.error?.message || JSON.stringify(data)}`);
  }

  const resourceNames: string[] = data.resourceNames || [];
  const customers: { customerId: string; descriptiveName: string }[] = [];

  for (const rn of resourceNames) {
    const id = rn.replace('customers/', '').replace(/-/g, '');
    try {
      // Use googleads.search to get customer descriptive name
      const custResp = await fetch(
        `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${id}/googleAds:searchStream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1',
          }),
        }
      );
      if (custResp.ok) {
        const custData = await custResp.json();
        const name = custData[0]?.results?.[0]?.customer?.descriptiveName || id;
        customers.push({ customerId: id, descriptiveName: name });
      } else {
        // May be a manager account we can't query directly — still list it
        customers.push({ customerId: id, descriptiveName: `Account ${id}` });
      }
    } catch {
      customers.push({ customerId: id, descriptiveName: `Account ${id}` });
    }
  }

  return customers;
}

/**
 * Create a Customer Match user list in Google Ads.
 */
export async function createUserList(
  accessToken: string,
  developerToken: string,
  customerId: string,
  listName: string,
  description: string
): Promise<string> {
  const resp = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/userLists:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: listName,
              description,
              membershipLifeSpan: 10000,
              crmBasedUserList: {
                uploadKeyType: 'CONTACT_INFO',
                dataSourceType: 'FIRST_PARTY',
              },
            },
          },
        ],
      }),
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Failed to create user list: ${data.error?.message || JSON.stringify(data)}`);
  }

  const resourceName = data.results?.[0]?.resourceName;
  if (!resourceName) throw new Error('No resource name returned from user list creation');

  return resourceName;
}

/**
 * Upload hashed user data to a Google Ads user list via offline user data jobs.
 */
export async function uploadUserData(
  accessToken: string,
  developerToken: string,
  customerId: string,
  userListResourceName: string,
  hashedContacts: { hashedEmail?: string; hashedPhone?: string; hashedFirstName?: string; hashedLastName?: string; zipCode?: string; countryCode?: string }[]
): Promise<{ successCount: number; failedCount: number }> {
  // Create an offline user data job
  const createJobResp = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/offlineUserDataJobs:create`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          type: 'CUSTOMER_MATCH_USER_LIST',
          customerMatchUserListMetadata: {
            userList: userListResourceName,
            consent: {
              adUserData: 'GRANTED',
              adPersonalization: 'GRANTED',
            },
          },
        },
      }),
    }
  );

  const createJobData = await createJobResp.json();
  if (!createJobResp.ok) {
    throw new Error(`Failed to create data job: ${createJobData.error?.message || JSON.stringify(createJobData)}`);
  }

  const jobResourceName = createJobData.resourceName;

  // Add operations in batches of 5000
  const batchSize = 5000;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < hashedContacts.length; i += batchSize) {
    const batch = hashedContacts.slice(i, i + batchSize);

    const operations = batch.map(contact => {
      const userIdentifiers: any[] = [];

      if (contact.hashedEmail) {
        userIdentifiers.push({ hashedEmail: contact.hashedEmail });
      }
      if (contact.hashedPhone) {
        userIdentifiers.push({ hashedPhoneNumber: contact.hashedPhone });
      }
      if (contact.hashedFirstName && contact.hashedLastName) {
        userIdentifiers.push({
          addressInfo: {
            hashedFirstName: contact.hashedFirstName,
            hashedLastName: contact.hashedLastName,
            countryCode: contact.countryCode || 'US',
            postalCode: contact.zipCode || '',
          },
        });
      }

      return {
        create: {
          userIdentifiers,
        },
      };
    });

    try {
      const addResp = await fetch(
        `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${jobResourceName}:addOperations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            enablePartialFailure: true,
            operations,
          }),
        }
      );

      if (addResp.ok) {
        successCount += batch.length;
      } else {
        failedCount += batch.length;
      }
    } catch {
      failedCount += batch.length;
    }
  }

  // Run the job
  await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${jobResourceName}:run`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    }
  );

  return { successCount, failedCount };
}

/**
 * Upload offline conversions to Google Ads.
 */
export async function uploadOfflineConversions(
  accessToken: string,
  developerToken: string,
  customerId: string,
  conversionActionId: string,
  conversions: { hashedEmail: string; conversionDateTime: string; conversionValue?: number; currencyCode?: string }[]
): Promise<{ successCount: number; failedCount: number }> {
  const batchSize = 2000;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < conversions.length; i += batchSize) {
    const batch = conversions.slice(i, i + batchSize);

    const conversionOps = batch.map(c => ({
      conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
      conversionDateTime: c.conversionDateTime,
      conversionValue: c.conversionValue || 1.0,
      currencyCode: c.currencyCode || 'USD',
      userIdentifiers: [
        { hashedEmail: c.hashedEmail },
      ],
      consent: {
        adUserData: 'GRANTED',
        adPersonalization: 'GRANTED',
      },
    }));

    try {
      const resp = await fetch(
        `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversions: conversionOps,
            partialFailure: true,
          }),
        }
      );

      if (resp.ok) {
        successCount += batch.length;
      } else {
        failedCount += batch.length;
      }
    } catch {
      failedCount += batch.length;
    }
  }

  return { successCount, failedCount };
}
