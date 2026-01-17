/**
 * EmailService
 *
 * Handles email sending with support for:
 * - Development mode (console logging only)
 * - SMTP transport for production
 *
 * Never logs full email body in production.
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
}

// Environment configuration
const isDevMode = process.env.EMAIL_MODE !== 'smtp';
const smtpConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'noreply@sched.local',
};

/**
 * Send an email
 *
 * In dev mode, logs to console and returns success.
 * In production, uses SMTP transport.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text } = options;

  if (isDevMode) {
    return sendEmailDev(to, subject, html, text);
  }

  return sendEmailSmtp(to, subject, html, text);
}

/**
 * Development mode: log email to console
 */
async function sendEmailDev(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailResult> {
  const messageId = `dev-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📧 EMAIL (Dev Mode)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message: ${messageId}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('Text:');
  console.log(text);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('HTML (truncated):');
  console.log(html.substring(0, 500) + (html.length > 500 ? '...' : ''));
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  return {
    success: true,
    messageId,
    error: null,
  };
}

/**
 * Production mode: send via SMTP
 *
 * Uses fetch to a mail relay endpoint or native SMTP.
 * This is a simplified implementation - in production you might use
 * nodemailer or a service like SendGrid, Postmark, etc.
 */
async function sendEmailSmtp(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailResult> {
  // Check if we have an HTTP mail endpoint (for services like SendGrid, Postmark)
  const mailApiUrl = process.env.MAIL_API_URL;
  const mailApiKey = process.env.MAIL_API_KEY;

  if (mailApiUrl && mailApiKey) {
    return sendViaHttpApi(mailApiUrl, mailApiKey, to, subject, html, text);
  }

  // Fall back to basic SMTP via nodemailer-like approach
  // For now, return an error indicating SMTP not configured
  // In a real implementation, you'd use nodemailer here
  console.error('[EmailService] SMTP mode enabled but no MAIL_API_URL configured');
  console.log(`[EmailService] Would send email to: ${to}, subject: ${subject}`);

  return {
    success: false,
    messageId: null,
    error: 'SMTP not configured - set MAIL_API_URL and MAIL_API_KEY',
  };
}

/**
 * Send via HTTP API (e.g., SendGrid, Postmark, Resend)
 */
async function sendViaHttpApi(
  apiUrl: string,
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailResult> {
  try {
    // Generic payload - adjust for your email provider
    const payload = {
      from: smtpConfig.from,
      to,
      subject,
      html,
      text,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Don't log full error which might contain sensitive info
      console.error(`[EmailService] API error: ${response.status}`);
      return {
        success: false,
        messageId: null,
        error: `API error: ${response.status}`,
      };
    }

    const result = await response.json();
    const messageId = result.id || result.messageId || result.message_id || `api-${Date.now()}`;

    // Log success without body content
    console.log(`[EmailService] Sent email to: ${to}, messageId: ${messageId}`);

    return {
      success: true,
      messageId,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[EmailService] Send failed: ${errorMessage}`);
    return {
      success: false,
      messageId: null,
      error: errorMessage,
    };
  }
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  if (isDevMode) return true;
  return !!(process.env.MAIL_API_URL && process.env.MAIL_API_KEY);
}

/**
 * Get email service status
 */
export function getEmailServiceStatus(): {
  mode: 'dev' | 'smtp';
  configured: boolean;
  from: string;
} {
  return {
    mode: isDevMode ? 'dev' : 'smtp',
    configured: isEmailConfigured(),
    from: smtpConfig.from,
  };
}
