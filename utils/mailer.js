const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_EMAIL,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

// Verify connection only in dev
if (process.env.NODE_ENV !== 'production') {
  transporter.verify((error, success) => {
    if (error) console.error('❌ SMTP connection failed:', error.message);
    else console.log('✅ Brevo SMTP connected successfully.');
  });
}

module.exports = transporter;
