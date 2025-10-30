const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/user');
const brevo = require('@getbrevo/brevo');

// Initialize Brevo API
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@codeelevatex.sbs";
const FROM_NAME = process.env.FROM_NAME || "codeElevateX";

// -------------------------
// Subscribe to Newsletter
// -------------------------
router.post('/subscribe', express.json(), async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }

  try {
    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      if (user.isSubscribed) {
        return res.json({ success: true, message: 'You are already subscribed to our newsletter!' });
      } else {
        // Resubscribe
        user.isSubscribed = true;
        await user.save();
      }
    } else {
      // Create new subscriber (user with no password - newsletter only)
      user = await User.create({
        name: email.split('@')[0],
        email: email.toLowerCase(),
        isSubscribed: true,
        isVerified: false,
      });
    }

    // Generate unsubscribe token
    const unsubscribeToken = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key')
      .update(email.toLowerCase())
      .digest('hex');

    // Send welcome email using Brevo API
    const unsubscribeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken}`;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.subject = '🎉 Welcome to codeElevateX Newsletter!';
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px;">
        <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="${process.env.FRONTEND_URL}/codeElevateXlogo.png" alt="codeElevateX Logo" style="height: 60px;">
          </div>
          
          <h2 style="color: #667eea; text-align: center; margin-bottom: 20px;">🎉 Welcome to Our Newsletter!</h2>
          
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            Thank you for subscribing to the codeElevateX newsletter!
          </p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; margin: 25px 0; border-radius: 10px; color: white; text-align: center;">
            <h3 style="margin: 0 0 15px 0; color: white;">What You'll Get:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin: 10px 0;">✨ Latest course updates</li>
              <li style="margin: 10px 0;">💡 Exclusive coding tips & tricks</li>
              <li style="margin: 10px 0;">🎁 Special offers & discounts</li>
              <li style="margin: 10px 0;">📚 New tutorials & resources</li>
            </ul>
          </div>
          
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            We're excited to have you as part of our learning community! 🚀
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}" 
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
              Explore Our Courses
            </a>
          </div>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            © ${new Date().getFullYear()} codeElevateX. All rights reserved.<br>
            Don't want these emails? <a href="${unsubscribeUrl}" style="color: #667eea; text-decoration: underline;">Unsubscribe here</a>
          </p>
        </div>
      </div>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);

    res.json({ success: true, message: 'Successfully subscribed! Check your email for confirmation.' });
  } catch (err) {
    console.error('Newsletter subscription error:', err.response ? err.response.body : err);
    res.status(500).json({ success: false, message: 'Failed to subscribe. Please try again later.' });
  }
});

// -------------------------
// Unsubscribe from Newsletter
// -------------------------
router.get('/unsubscribe', async (req, res) => {
  const { email, token } = req.query;

  if (!email || !token) {
    return res.status(400).send('<h1>Invalid unsubscribe link</h1>');
  }

  try {
    // Verify token
    const validToken = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key')
      .update(email.toLowerCase())
      .digest('hex');

    if (token !== validToken) {
      return res.status(400).send('<h1>Invalid unsubscribe token</h1>');
    }

    // Unsubscribe user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (user) {
      user.isSubscribed = false;
      await user.save();
    }

    // Send HTML response
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribed - codeElevateX</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 15px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #667eea;
            margin-bottom: 20px;
          }
          p {
            color: #666;
            line-height: 1.6;
            margin: 15px 0;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 50px;
            font-weight: bold;
            margin-top: 20px;
          }
          .emoji {
            font-size: 64px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">😢</div>
          <h1>You've Been Unsubscribed</h1>
          <p>We're sorry to see you go! You have been successfully unsubscribed from our newsletter.</p>
          <p>You will no longer receive promotional emails from us.</p>
          <p>Changed your mind? You can resubscribe anytime from our website.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Back to Home</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).send('<h1>Something went wrong. Please try again later.</h1>');
  }
});

module.exports = router;
