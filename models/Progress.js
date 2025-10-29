// models/Progress.js - Individual learning progress
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
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
  lessonId: {
    type: String, // can also be ObjectId if you want to reference Lesson model
    required: true
  },
  
  // Progress Details
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'skipped'],
    default: 'not_started'
  },
  
  // Time Tracking
  timeSpent: { type: Number, default: 0 }, // in seconds
  startedAt: Date,
  completedAt: Date,
  lastAccessedAt: { type: Date, default: Date.now },
  
  // Lesson-Specific Progress
  lessonProgress: {
    // For quizzes
    quizAttempts: [{
      attemptId: String,
      answers: [{
        questionId: String,
        answer: String,
        isCorrect: Boolean,
        points: Number
      }],
      score: Number,
      maxScore: Number,
      percentage: Number,
      submittedAt: Date,
      timeSpent: Number
    }],
    
    // For coding exercises
    codingSubmissions: [{
      problemId: String,
      code: String,
      language: String,
      status: { type: String, enum: ['pending', 'passed', 'failed'] },
      testsPassed: Number,
      totalTests: Number,
      submittedAt: Date,
      executionTime: Number
    }],
    
    // For reading/video content
    watchTime: Number, // for videos
    readingProgress: Number, // percentage for text content
    bookmarks: [{
      position: Number, // timestamp in video or text position
      note: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  
  // Overall Lesson Score
  score: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Compound index for efficient querying
progressSchema.index({ userId: 1, courseId: 1, lessonId: 1 }, { unique: true });
progressSchema.index({ userId: 1, courseId: 1 });

module.exports = mongoose.model('Progress', progressSchema);
