const brevo = require('@getbrevo/brevo');

// -------------------- CONFIG --------------------
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "no-reply@codeelevatex.sbs";
const FROM_NAME = process.env.FROM_NAME || "CodeElevateX";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

if (!BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY is missing! Check your .env file.");
}

// -------------------- BREVO CLIENT --------------------
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);

console.log("✅ Brevo API initialized successfully");

// -------------------- SEND OTP --------------------
async function sendOtpEmail({ to, otp, purpose }) {
  let subject, htmlContent;

  if (purpose === "signup") {
    subject = "Verify your account - OTP";
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 30px 20px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; padding: 20px; background: #f9f9f9; border-radius: 8px; letter-spacing: 5px; margin: 20px 0; border: 2px dashed #667eea; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
          </div>
          <div class="content">
            <p>Hi,</p>
            <p>Thank you for signing up! Use the OTP code below to verify your email:</p>
            <div class="otp-code">${otp}</div>
            <p style="text-align: center; color: #dc3545;"><strong>⏰ This OTP expires in 10 minutes.</strong></p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 ${FROM_NAME}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (purpose === "reset") {
    const resetURL = `${CLIENT_URL}/reset-password/${otp}`;
    subject = "Reset Your Password";
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 30px 20px; }
          .reset-button { display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
          .reset-button:hover { opacity: 0.9; }
          .link-box { background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #ddd; margin: 20px 0; word-break: break-all; }
          .link-text { color: #667eea; font-size: 14px; margin: 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; }
          .warning { color: #dc3545; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Reset Your Password</h1>
          </div>
          <div class="content">
            <p>Hi,</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetURL}" class="reset-button">Reset Password</a>
            </div>
            <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
            <div class="link-box">
              <p class="link-text">${resetURL}</p>
            </div>
            <p class="warning">⏰ This link expires in 15 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 ${FROM_NAME}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
  sendSmtpEmail.to = [{ email: to }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ ${purpose === 'signup' ? 'OTP' : 'Reset link'} email sent to ${to}: ${data.messageId}`);
    return data;
  } catch (error) {
    console.error('❌ Brevo API error:', error.response ? error.response.body : error);
    throw error;
  }
}

module.exports = { sendOtpEmail };
