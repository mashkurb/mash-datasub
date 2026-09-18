import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// In-memory rate limiting for OTP requests: email -> lastSentTimestamp
const otpRateLimitMap = new Map<string, number>();

export function generateSecureOtp(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  // Use cryptographically secure random bytes
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % 10];
  }
  return otp;
}

export function checkOtpRateLimit(identifier: string, cooldownSeconds: number = 60): { allowed: boolean; remainingSeconds?: number } {
  const now = Date.now();
  const lastSent = otpRateLimitMap.get(identifier.toLowerCase());
  if (lastSent) {
    const elapsedSeconds = Math.floor((now - lastSent) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      return { allowed: false, remainingSeconds: cooldownSeconds - elapsedSeconds };
    }
  }
  return { allowed: true };
}

export function recordOtpSent(identifier: string) {
  otpRateLimitMap.set(identifier.toLowerCase(), Date.now());
}

export interface EmailConfigOptions {
  gmailUser?: string;
  gmailAppPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  fromName?: string;
}

export function getTransporter(customConfig?: EmailConfigOptions) {
  const gmailUser = customConfig?.gmailUser?.trim() || process.env.GMAIL_USER?.trim();
  const gmailPass = customConfig?.gmailAppPassword?.trim() || process.env.GMAIL_APP_PASSWORD?.trim();

  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });
  }

  const smtpHost = customConfig?.smtpHost?.trim() || process.env.SMTP_HOST?.trim();
  const smtpPort = customConfig?.smtpPort || parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = customConfig?.gmailUser?.trim() || process.env.SMTP_USER?.trim();
  const smtpPass = customConfig?.gmailAppPassword?.trim() || process.env.SMTP_PASS?.trim();

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }

  return null;
}

export async function testEmailConnection(config: EmailConfigOptions, targetEmail: string): Promise<{ success: boolean; message: string; error?: string }> {
  const transporter = getTransporter(config);
  if (!transporter) {
    return {
      success: false,
      message: 'Missing Gmail credentials. Please provide both Gmail User and App Password.',
      error: 'Incomplete credentials'
    };
  }

  try {
    // Verify transporter connection
    await transporter.verify();

    const fromAddress = `"${config.fromName || 'Mash DataSub'}" <${config.gmailUser || process.env.GMAIL_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: targetEmail,
      subject: '[Mash DataSub] SMTP Configuration Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
          <h2 style="color: #1e3a8a;">Gmail SMTP Verification Successful</h2>
          <p>This is an automated test message from your Mash DataSub application.</p>
          <p>Your Gmail credentials are valid and active for sending verification OTPs and customer notifications.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
      text: 'Gmail SMTP Verification Successful. Your Mash DataSub email settings are working correctly.'
    });

    return {
      success: true,
      message: `Test email sent successfully to ${targetEmail}. (Message ID: ${info.messageId})`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to authenticate with Gmail SMTP server. Check that 2-Step Verification is enabled and that you are using a 16-character App Password (not your regular account password).',
      error: err.message
    };
  }
}

export async function sendOtpEmail(toEmail: string, otp: string, purpose: 'registration' | 'forgot_password', customConfig?: EmailConfigOptions): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter(customConfig);

  const title = purpose === 'registration' ? 'Verify Your Mash DataSub Account' : 'Password Reset Verification Code';
  const subtitle = purpose === 'registration'
    ? 'Thank you for choosing Mash DataSub. Please enter the verification code below to activate your customer account.'
    : 'We received a request to reset the password for your Mash DataSub account. Use this one-time passcode to proceed.';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; }
        .brand { font-size: 20px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px; margin-bottom: 20px; }
        .code-box { background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
        .code { font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #15803d; font-family: monospace; }
        .footer { margin-top: 28px; font-size: 12px; color: #6b7280; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">Mash DataSub</div>
        <h2 style="font-size: 18px; color: #111827; margin: 0 0 12px 0;">${title}</h2>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 16px 0;">${subtitle}</p>
        <div class="code-box">
          <div class="code">${otp}</div>
        </div>
        <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin: 0;">
          This verification code will expire in <strong>10 minutes</strong>. It can only be used once. Never share this code with anyone.
        </p>
        <div class="footer">
          Mash DataSub &bull; Automated Security Service<br/>
          Need assistance? Contact support at 0808 1419 276
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    // If transporter is not configured, we log this securely on server
    console.warn(`[Mash DataSub] Email transporter not configured in server environment (GMAIL_USER / GMAIL_APP_PASSWORD). Generated OTP for ${toEmail}: ${otp}`);
    if (process.env.ALLOW_DEV_OTP === 'true') {
      return { success: true };
    }
    return {
      success: false,
      error: 'Please configure Gmail credentials in settings to receive OTP.'
    };
  }

  const sender = process.env.SMTP_FROM || `"Mash DataSub" <${process.env.GMAIL_USER}>`;

  try {
    const info = await transporter.sendMail({
      from: sender,
      to: toEmail,
      subject: `[Mash DataSub] ${otp} is your verification code`,
      html,
      text: `${title}\n\nYour OTP code is: ${otp}\n\nValid for 10 minutes. Do not share.`
    });
    console.log(`[Mash DataSub] OTP email dispatched successfully to ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Mash DataSub] Failed to send email to ${toEmail}:`, err.message);
    return {
      success: false,
      error: `Could not send verification email: ${err.message || 'Gmail SMTP connection failed'}`
    };
  }
}
