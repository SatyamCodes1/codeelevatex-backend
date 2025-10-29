// models/Enrollment.js - Updated Enrollment Schema
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  completedLessons: { type: [String], default: [] }, // Array of lesson IDs
  currentLesson: { type: String, default: null },
  totalProgress: { type: Number, default: 0 }, // Percentage
  timeSpent: { type: Number, default: 0 }, // in minutes
  lastAccessed: { type: Date, default: Date.now }
}, { _id: false });

const enrollmentSchema = new mongoose.Schema({
  // Who and What
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Course'
  },
  
  // Enrollment Details
  status: {
    type: String,
    enum: ['active', 'completed', 'dropped', 'suspended'],
    default: 'active'
  },
  
  // Payment Info
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    required: true,
    default: 'pending'
  },
  paymentMethod: { type: String, default: 'razorpay' },
  amountPaid: { type: Number, required: true, default: 0 },
  
  // Progress Tracking
  progress: { type: progressSchema, default: () => ({}) },
  
  // Completion Details
  completedAt: { type: Date, default: null },
  certificateIssued: { type: Boolean, default: false },
  finalGrade: { type: Number, default: null },
  
  // Access Control
  accessExpiresAt: { type: Date, default: null },
  accessLevel: {
    type: String,
    enum: ['preview', 'full', 'expired'],
    default: 'preview'
  }
}, {
  timestamps: true
});

// Ensure one enrollment per user per course
enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
