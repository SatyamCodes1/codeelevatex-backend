require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const connectDB = require('./config/database');

// Models
const User = require('./models/user');
const Course = require('./models/Course');

// Default courses seeding
const DEFAULT_COURSES = require('./utils/defaultCourses');

const app = express();
const PORT = process.env.PORT || 5000;

// -------------------- CHECK GROQ API CONNECTION --------------------
(async () => {
  console.log('🤖 Checking Groq API connection...');
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.error('❌ Missing GROQ_API_KEY in .env — add it before running the server.');
    process.exit(1);
  }

  try {
    const response = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });

    if (response.status === 200) {
      console.log('✅ Groq API connected successfully!');
    } else {
      console.error('⚠️ Groq API responded with unexpected status:', response.status);
    }
  } catch (err) {
    console.error('🚫 Failed to connect to Groq API:', err.response?.data?.error?.message || err.message);
  }
})();

// -------------------- DATABASE CONNECTION --------------------
connectDB()
  .then(async () => {
    console.log('📦 MongoDB Connected Successfully');

    // --- Ensure default admin user exists ---
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });
      console.log(`✅ Admin user created: ${adminEmail}`);
    } else {
      console.log(`👑 Admin user already exists: ${adminEmail}`);
    }

    // --- Seed default courses ---
    for (const defaultCourse of DEFAULT_COURSES) {
      defaultCourse.instructor = { userId: adminUser._id };
      defaultCourse.status = 'published';

      const existing = await Course.findOne({ title: defaultCourse.title });
      if (!existing) {
        await Course.create(defaultCourse);
        console.log(`📘 Default course added: ${defaultCourse.title}`);
      } else {
        if (existing.status !== 'published') {
          existing.status = 'published';
          existing.instructor = { userId: adminUser._id };
          await existing.save();
          console.log(`🔄 Default course updated: ${defaultCourse.title}`);
        } else {
          console.log(`✅ Default course already exists: ${defaultCourse.title}`);
        }
      }
    }

    console.log('🟢 Database Initialization Complete!');
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Failed:', err.message);
  });

// -------------------- MIDDLEWARES --------------------
app.use(helmet());
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'https://darien-hypereutectic-natively.ngrok-free.dev',
    ],
    credentials: true,
  })
);

app.use('/api/payment/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// -------------------- BASIC ROUTES --------------------
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Learning Platform API is running successfully!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    message: '✅ API is healthy!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// -------------------- GROQ API GUARD --------------------
app.use('/api/ai', async (req, res, next) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: 'Groq API key missing. Please contact the admin.',
    });
  }

  try {
    const ping = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });

    if (ping.status !== 200) {
      console.error('⚠️ Groq API unavailable:', ping.data?.error?.message);
      return res.status(502).json({
        success: false,
        message: 'Groq API temporarily unavailable. Try again later.',
      });
    }

    next();
  } catch (error) {
    console.error('🚫 Groq connection error:', error.response?.data?.error?.message || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to connect to Groq AI service.',
    });
  }
});

// -------------------- ROUTES --------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/social-login', require('./routes/social-login'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/enrollments', require('./routes/enrollmentRoutes'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/ai', require('./routes/ai-assistant'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/admin/courses', require('./routes/adminCourseRoutes'));

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server is live on port: ${PORT}`);
  console.log(`🌍 Access it at: http://localhost:${PORT}`);
  console.log(`⚙️ Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
