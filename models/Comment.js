const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true },
    lessonId: { type: String, default: null },
    parentId: { type: String, default: null },
    content: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: {
      id: String,
      name: String,
      role: { 
        type: String, 
        enum: ['admin', 'instructor', 'student', 'user'],  // ✅ Added 'user'
        default: 'student' 
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);