// models/Lesson.js - Individual lesson content
const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  // Lesson Identity
  lessonId: {
    type: String,
    required: true,
    unique: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Course'
  },
  unitId: {
    type: String,
    required: true
  },
  
  // Lesson Details
  title: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['explanation', 'examples', 'quiz', 'coding'],
    required: true
  },
  order: { type: Number, required: true },
  duration: Number, // estimated time in minutes
  
  // Content Based on Type
  content: {
    // For explanation type
    explanation: {
      text: String,
      images: [String], // image URLs
      videos: [String], // video URLs
      codeExamples: [{
        language: String,
        code: String,
        description: String
      }]
    },
    
    // For examples type
    examples: [ {
      title: String,
      description: String,
      code: String,
      language: String,
      output: String
    } ],
    
    // For quiz type
    quiz: {
      questions: [ {
        questionId: String,
        type: { type: String, enum: ['mcq', 'fill_blank', 'true_false'] },
        question: String,
        options: [String], // for MCQ
        correctAnswer: String,
        explanation: String,
        points: { type: Number, default: 1 }
      } ],
      timeLimit: Number, // in minutes
      passingScore: { type: Number, default: 70 }
    },
    
    // For coding type
    coding: [ {
      problemId: String,
      title: String,
      description: String,
      difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
      language: { type: String, enum: ['python', 'cpp', 'javascript'] },
      starterCode: String,
      solution: String,
      testCases: [ {
        input: String,
        expectedOutput: String,
        points: { type: Number, default: 1 }
      } ],
      hints: [String]
    } ]
  },
  
  // Prerequisites
  prerequisites: [String], // lesson IDs that must be completed first
  
  // Settings
  isPreview: { type: Boolean, default: false },
  allowComments: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Lesson', lessonSchema);
