import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole } from '@/lib/api-helpers';
import { getSmtpConfig, isSmtpConfigured, sendMail, verifySmtp } from '@/lib/mailer';
import { getChatNotificationSettings } from '@/lib/chat-notifications';

/**
 * Send a test notification email to the calling admin's own address.
 * Lets an admin validate SMTP credentials (e.g. a fresh Gmail app password)
 * without waiting for a real chat message.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const recipient = (req.body?.to as string | undefined)?.trim() || authResult.user.email;
  if (!recipient) {
    return res.status(400).json({ error: 'No recipient address available' });
  }

  // forceRefresh: the admin has just saved these values, so bypass the 60s
  // settings cache instead of testing the previous credentials.
  const config = await getSmtpConfig(true);
  if (!isSmtpConfigured(config)) {
    return res.status(400).json({ error: 'Enter and save the SMTP host, username, and password first.' });
  }

  const verified = await verifySmtp();
  if (!verified.ok) {
    return res.status(400).json({ error: `SMTP connection failed: ${verified.error}` });
  }

  // CC the configured list too, so the test also proves CC delivery works
  const { ccEmails } = await getChatNotificationSettings();
  const cc = ccEmails.filter((address) => address !== recipient.toLowerCase());

  const result = await sendMail(
    {
      to: recipient,
      cc,
      subject: 'Traffic AI — chat notification test email',
      text: [
        'This is a test email from the Traffic AI admin panel.',
        '',
        `SMTP host: ${config.host}:${config.port}`,
        `Sent as: ${config.user}`,
        cc.length ? `CC: ${cc.join(', ')}` : 'CC: (none configured)',
        '',
        'If you received this, chat email notifications can be enabled.',
      ].join('\n'),
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;">
          <h2 style="color:#111827;font-size:18px;margin:0 0 10px 0;">SMTP is working</h2>
          <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px 0;">
            This is a test email from the Traffic AI admin panel.
          </p>
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            SMTP host: <strong>${config.host}:${config.port}</strong><br />
            Sent as: <strong>${config.user}</strong><br />
            CC: <strong>${cc.length ? cc.join(', ') : '(none configured)'}</strong>
          </p>
        </div>`,
    },
    'chat_notification_test_email'
  );

  if (!result.ok) {
    return res.status(400).json({ error: result.error || 'Failed to send test email' });
  }

  return res.status(200).json({ ok: true, to: recipient, cc, messageId: result.messageId });
}
