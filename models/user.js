// models/user.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: false, // password optional for social login
      minlength: 6,
      select: false,
    },

    // Social login IDs
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },

    // Role (only user and admin now)
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    // Profile Info
    avatar: { type: String, default: 'default-avatar.png' },
    bio: String,
    dateOfBirth: Date,

    // Preferences
    preferences: {
      language: { type: String, default: 'en' },
      notifications: { type: Boolean, default: true },
      theme: { type: String, default: 'light' },
    },

    // Courses
    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
      },
    ],

    // Account Status
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // Subscription
    isSubscribed: { type: Boolean, default: true },

    // Tracking
    lastLogin: Date,
    totalLearningTime: { type: Number, default: 0 },

    // Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving (only if modified)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed one
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // social login has no password
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

