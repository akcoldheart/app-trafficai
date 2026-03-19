import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import crypto from 'crypto';

function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // Fallback: base64 encode if ENCRYPTION_KEY not configured
    return 'b64:' + Buffer.from(text).toString('base64');
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const encryptedCredentials = {
      email: encrypt(email),
      password: encrypt(password),
    };

    const result = await saveIntegration(user.id, 'linkedin', {
      config: {
        credentials: encryptedCredentials,
        account_email: email,
        account_name: name || email.split('@')[0],
      },
    });

    return res.status(200).json({
      success: true,
      message: 'LinkedIn account connected successfully',
      integration: result,
    });
  } catch (error) {
    console.error('Error connecting LinkedIn:', error);
    return res.status(500).json({ error: 'Failed to connect LinkedIn account', details: (error as Error).message });
  }
}
