import nodemailer, { type Transporter } from 'nodemailer';
import { getAllSettings } from '@/lib/settings';
import { logEvent } from '@/lib/webhook-logger';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  replyTo: string;
  appUrl: string;
}

/**
 * Resolve SMTP config from app_settings, falling back to env vars.
 * Same precedence as getStripeConfig() — DB settings win so an admin can fix
 * credentials from the Settings page without a redeploy.
 */
export async function getSmtpConfig(forceRefresh = false): Promise<SmtpConfig> {
  const settings = await getAllSettings(forceRefresh);

  const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '465', 10);
  const user = settings.smtp_user || process.env.SMTP_USER || '';
  const password = settings.smtp_password || process.env.SMTP_PASSWORD || '';

  return {
    host,
    port,
    // 465 is implicit TLS; 587/25 start plaintext and upgrade via STARTTLS
    secure: port === 465,
    user,
    password,
    fromName: settings.smtp_from_name || 'Traffic AI Support',
    replyTo: settings.smtp_reply_to || user,
    appUrl: settings.app_url || process.env.NEXT_PUBLIC_APP_URL || '',
  };
}

export function isSmtpConfigured(config: SmtpConfig): boolean {
  return Boolean(config.host && config.port && config.user && config.password);
}

// Cache the transporter (with its connection pool) across invocations in the
// same warm lambda. The fingerprint means a credential change in Settings
// rebuilds it instead of silently reusing the old connection.
let cachedTransporter: Transporter | null = null;
let cachedFingerprint = '';

function fingerprintOf(config: SmtpConfig): string {
  return `${config.host}:${config.port}:${config.user}:${config.password.length}:${config.password.slice(-4)}`;
}

function getTransporter(config: SmtpConfig): Transporter {
  const fingerprint = fingerprintOf(config);

  if (cachedTransporter && cachedFingerprint === fingerprint) {
    return cachedTransporter;
  }

  if (cachedTransporter) {
    cachedTransporter.close();
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    pool: true,
    maxConnections: 2,
  });
  cachedFingerprint = fingerprint;

  return cachedTransporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Real CC header — visible to every recipient, including the customer. */
  cc?: string[];
}

export interface SendMailResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send one email. Never throws — callers (cron rows, API routes) decide what to
 * do with { ok, error }.
 */
export async function sendMail(input: SendMailInput, eventName = 'chat_notification_email'): Promise<SendMailResult> {
  let config: SmtpConfig;
  try {
    config = await getSmtpConfig();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load SMTP config' };
  }

  if (!isSmtpConfigured(config)) {
    const error = 'SMTP is not configured (missing host, user, or password)';
    await logEvent({
      type: 'error',
      event_name: eventName,
      status: 'error',
      message: `Email to ${input.to} not sent: ${error}`,
      error_details: error,
    });
    return { ok: false, error };
  }

  const cc = (input.cc || []).filter(Boolean);

  try {
    const info = await getTransporter(config).sendMail({
      from: `"${config.fromName}" <${config.user}>`,
      to: input.to,
      cc: cc.length > 0 ? cc.join(', ') : undefined,
      replyTo: input.replyTo || config.replyTo || config.user,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    await logEvent({
      type: 'info',
      event_name: eventName,
      status: 'success',
      message: `Email sent to ${input.to}${cc.length ? ` (cc ${cc.join(', ')})` : ''}: ${input.subject}`,
      response_data: { messageId: info.messageId, accepted: info.accepted?.length ?? 0, cc },
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown SMTP error';
    // Force a rebuild next time — a dead pooled connection would keep failing.
    if (cachedTransporter) {
      cachedTransporter.close();
      cachedTransporter = null;
      cachedFingerprint = '';
    }
    await logEvent({
      type: 'error',
      event_name: eventName,
      status: 'error',
      message: `Email to ${input.to} failed: ${input.subject}`,
      error_details: error,
    });
    return { ok: false, error };
  }
}

/**
 * Check the SMTP credentials without sending anything.
 * Used by the "Send test email" button so a bad app password reports a real
 * SMTP error instead of a generic failure.
 */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const config = await getSmtpConfig(true);

  if (!isSmtpConfigured(config)) {
    return { ok: false, error: 'SMTP is not configured (missing host, user, or password)' };
  }

  try {
    await getTransporter(config).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown SMTP error' };
  }
}

/** Escape user-supplied text before interpolating it into an HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
