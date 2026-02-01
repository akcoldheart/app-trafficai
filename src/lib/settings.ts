import { createClient as createServiceClient } from '@supabase/supabase-js';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

// Cache settings for 60 seconds to reduce database calls
let settingsCache: Record<string, string> = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds

/**
 * Get a single setting value from the database
 */
export async function getSetting(key: string): Promise<string | null> {
  const settings = await getAllSettings();
  return settings[key] || null;
}

/**
 * Get all settings from the database (with caching)
 */
export async function getAllSettings(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();

  // Return cached settings if still valid
  if (!forceRefresh && settingsCache && Object.keys(settingsCache).length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value');

    if (error) {
      console.error('Error fetching settings:', error);
      // Return cached settings if available, even if stale
      return settingsCache;
    }

    // Build settings object
    const settings: Record<string, string> = {};
    data?.forEach((row) => {
      settings[row.key] = row.value || '';
    });

    // Update cache
    settingsCache = settings;
    cacheTimestamp = now;

    return settings;
  } catch (error) {
    console.error('Error in getAllSettings:', error);
    return settingsCache;
  }
}

/**
 * Get settings by category
 */
export async function getSettingsByCategory(category: string): Promise<Record<string, string>> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('category', category);

    if (error) {
      console.error('Error fetching settings by category:', error);
      return {};
    }

    const settings: Record<string, string> = {};
    data?.forEach((row) => {
      settings[row.key] = row.value || '';
    });

    return settings;
  } catch (error) {
    console.error('Error in getSettingsByCategory:', error);
    return {};
  }
}

/**
 * Get Stripe configuration from database
 */
export async function getStripeConfig() {
  // Use getAllSettings to get settings regardless of category
  // This is more robust as it doesn't depend on category being set correctly
  const allSettings = await getAllSettings();

  return {
    secretKey: allSettings.stripe_secret_key || process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: allSettings.stripe_webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      starter: {
        monthly: allSettings.stripe_starter_monthly_price_id || process.env.NEXT_PUBLIC_STRIPE_STARTER_MONTHLY || '',
        yearly: allSettings.stripe_starter_yearly_price_id || process.env.NEXT_PUBLIC_STRIPE_STARTER_YEARLY || '',
      },
      growth: {
        monthly: allSettings.stripe_growth_monthly_price_id || process.env.NEXT_PUBLIC_STRIPE_GROWTH_MONTHLY || '',
        yearly: allSettings.stripe_growth_yearly_price_id || process.env.NEXT_PUBLIC_STRIPE_GROWTH_YEARLY || '',
      },
      professional: {
        monthly: allSettings.stripe_professional_monthly_price_id || process.env.NEXT_PUBLIC_STRIPE_PROFESSIONAL_MONTHLY || '',
        yearly: allSettings.stripe_professional_yearly_price_id || process.env.NEXT_PUBLIC_STRIPE_PROFESSIONAL_YEARLY || '',
      },
    },
    appUrl: allSettings.app_url || process.env.NEXT_PUBLIC_APP_URL || '',
  };
}

/**
 * Get plan pricing configuration from database
 */
export async function getPlanPricing() {
  const settings = await getSettingsByCategory('pricing');

  // yearlyPrice is the effective monthly rate when billed annually
  return {
    starter: {
      monthlyPrice: parseInt(settings.plan_starter_monthly_price) || 500,
      yearlyPrice: parseInt(settings.plan_starter_yearly_price) || 425,
      visitors: settings.plan_starter_visitors || '3,000',
    },
    growth: {
      monthlyPrice: parseInt(settings.plan_growth_monthly_price) || 800,
      yearlyPrice: parseInt(settings.plan_growth_yearly_price) || 680,
      visitors: settings.plan_growth_visitors || '5,000',
    },
    professional: {
      monthlyPrice: parseInt(settings.plan_professional_monthly_price) || 1200,
      yearlyPrice: parseInt(settings.plan_professional_yearly_price) || 1020,
      visitors: settings.plan_professional_visitors || '10,000',
    },
  };
}

/**
 * Clear the settings cache
 */
export function clearSettingsCache() {
  settingsCache = {};
  cacheTimestamp = 0;
}
