// models/Course.js - FIXED SCHEMA WITH CONTENT STORAGE

const mongoose = require("mongoose");

// -------------------------------------------
// 🧩 LESSON SCHEMA - WITH MIXED CONTENT TYPE
// -------------------------------------------
const lessonSchema = new mongoose.Schema(
  {
    lessonId: { type: String, required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["video", "text", "quiz", "coding", "assignment", "explanation", "examples"],
      required: false, // Make optional since we have multiple types now
    },
    // ✅ CRITICAL FIX: Use Mixed type to store any content structure
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        explanation: [],
        examples: [],
        quiz: [],
        coding: []
      })
    },
    videoUrl: { type: String, default: "" },
    codeExample: { type: String, default: "" },
    quizQuestions: [
      {
        question: String,
        options: [String],
        correctAnswer: String,
      },
    ],
    duration: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    isPreview: { type: Boolean, default: false },
  },
  { _id: false }
);

// -------------------------------------------
// 📚 UNIT SCHEMA
// -------------------------------------------
const unitSchema = new mongoose.Schema(
  {
    unitId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    lessons: { type: [lessonSchema], default: [] },
  },
  { _id: false }
);

// -------------------------------------------
// 🎓 COURSE SCHEMA
// -------------------------------------------
const courseSchema = new mongoose.Schema(
  {
    // Basic Info
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    thumbnail: { type: String, default: "" },

    // Course Details
    category: {
      type: String,
      required: true,
      enum: ["programming", "design", "business", "other"],
      default: "other",
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    language: { type: String, default: "en" },

    // Pricing
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },

    // Course Structure
    units: { type: [unitSchema], default: [] },

    // Instructor Info
    instructor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      name: { type: String, default: "" },
      bio: { type: String, default: "" },
      avatar: { type: String, default: "" },
    },

    // Stats
    totalDuration: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    totalEnrollments: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },

    // Status
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    publishDate: { type: Date },

    // Settings
    settings: {
      allowComments: { type: Boolean, default: true },
      allowRating: { type: Boolean, default: true },
      certificateEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// -------------------------------------------
// 🧮 MIDDLEWARE TO AUTO-CALCULATE TOTALS
// -------------------------------------------
courseSchema.pre("save", function (next) {
  const course = this;

  let totalDuration = 0;
  let totalLessons = 0;

  course.units.forEach((unit) => {
    totalLessons += unit.lessons.length;
    unit.lessons.forEach((lesson) => {
      totalDuration += lesson.duration || 0;
    });
  });

  course.totalLessons = totalLessons;
  course.totalDuration = totalDuration;

  console.log("🔄 PRE-SAVE MIDDLEWARE:", {
    courseId: course._id,
    totalLessons,
    totalDuration,
    unitsCount: course.units.length
  });

  next();
});

// -------------------------------------------
// Export Course Model
// -------------------------------------------
module.exports = mongoose.model("Course", courseSchema);
