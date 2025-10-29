const express = require('express');
const router = express.Router();
const transporter = require('../utils/mailer');

// -------------------------
// Contact Form Submission
// -------------------------
router.post('/submit', express.json(), async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // ✅ 1. Send email to admin
    await transporter.sendMail({
      from: `"codeElevateX Contact" <${process.env.BREVO_EMAIL}>`,
      to: process.env.ADMIN_EMAIL || process.env.BREVO_EMAIL,
      replyTo: email,
      subject: `📧 New Contact Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; border-radius: 10px;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px;">New Contact Form Message</h2>
            
            <div style="margin: 20px 0;">
              <p style="margin: 10px 0;"><strong>From:</strong> ${name}</p>
              <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #667eea;">${email}</a></p>
              <p style="margin: 10px 0;"><strong>Date:</strong> ${new Date().toLocaleString('en-IN')}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px;">
              <h3 style="margin: 0 0 15px 0; color: #333;">Message:</h3>
              <p style="margin: 0; color: #555; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <p style="margin: 0; color: #999; font-size: 12px;">This message was sent from the contact form on codeElevateX</p>
            </div>
          </div>
        </div>
      `,
    });

    // ✅ 2. Send confirmation email to user
    await transporter.sendMail({
      from: `"codeElevateX" <${process.env.BREVO_EMAIL}>`,
      to: email,
      subject: "We've received your message!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px;">
          <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="${process.env.FRONTEND_URL}/codeElevateXlogo.png" alt="codeElevateX Logo" style="height: 60px;">
            </div>
            
            <h2 style="color: #667eea; text-align: center;">Thank You for Contacting Us!</h2>
            
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
            
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              We've received your message and our team will get back to you as soon as possible, usually within 24-48 hours.
            </p>
            
            <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #667eea;">
              <p style="margin: 0; color: #666; font-size: 14px;"><strong>Your message:</strong></p>
              <p style="margin: 10px 0 0 0; color: #333; line-height: 1.6;">${message}</p>
            </div>
            
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              In the meantime, feel free to explore our courses and resources!
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                Visit Our Website
              </a>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="font-size: 12px; color: #999; text-align: center;">
              © ${new Date().getFullYear()} codeElevateX. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    res.json({ success: true, message: 'Message sent successfully! We\'ll get back to you soon.' });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});

module.exports = router;
