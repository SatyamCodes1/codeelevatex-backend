const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: String, required: true },
    lessonId: { type: String, default: null },
    type: { type: String, enum: ['user', 'ai'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIMessage', aiMessageSchema);
