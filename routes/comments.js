const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Comment = require('../models/Comment');

const router = express.Router();

// ✅ GET comments for a course/lesson
router.get('/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const lessonId = req.query.lessonId;

    console.log('📖 GET Comments:', { courseId, lessonId });

    const filter = { courseId };
    if (lessonId && lessonId !== 'undefined' && lessonId !== 'null') {
      filter.lessonId = lessonId;
    }

    const comments = await Comment.find(filter)
      .populate('userId', 'name role avatar')
      .sort({ createdAt: 1 })
      .lean();

    console.log('✅ Found comments:', comments.length);

    res.json({ 
      success: true,
      comments: comments || [] 
    });
  } catch (err) {
    console.error('❌ Get comments error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch comments',
      error: err.message 
    });
  }
});

// ✅ POST comment
router.post('/', auth, async (req, res) => {
  try {
    const { courseId, lessonId, parentId, content, user } = req.body;

    console.log('='.repeat(60));
    console.log('💬 POST Comment Request');
    console.log('='.repeat(60));
    console.log('User ID:', req.user._id || req.user.id);
    console.log('Course ID:', courseId);
    console.log('Lesson ID:', lessonId);
    console.log('Parent ID:', parentId);
    console.log('Content:', content);
    console.log('User Info:', user);
    console.log('='.repeat(60));

    // Validation
    if (!courseId) {
      console.log('❌ Missing courseId');
      return res.status(400).json({ 
        success: false,
        message: 'Course ID is required' 
      });
    }

    if (!content?.trim()) {
      console.log('❌ Missing or empty content');
      return res.status(400).json({ 
        success: false,
        message: 'Content required' 
      });
    }

    // Create comment
    const comment = await Comment.create({
      courseId,
      lessonId: lessonId || null,
      parentId: parentId || null,
      content: content.trim(),
      userId: req.user._id || req.user.id,
      user: {
        id: (req.user._id || req.user.id).toString(),
        name: user?.name || req.user.name || 'Anonymous',
        role: user?.role || req.user.role || 'student',
      },
    });

    console.log('✅ Comment created:', comment._id);

    res.status(201).json({
      success: true,
      _id: comment._id,
      parentId: comment.parentId,
      content: comment.content,
      user: comment.user,
      userId: comment.userId,
      createdAt: comment.createdAt,
    });
  } catch (err) {
    console.error('='.repeat(60));
    console.error('❌ Post comment error');
    console.error('='.repeat(60));
    console.error('Error:', err);
    console.error('Stack:', err.stack);
    console.error('='.repeat(60));
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to post comment',
      error: err.message 
    });
  }
});

// ✅ DELETE comment
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log('🗑️ DELETE Comment:', { 
      commentId: req.params.id, 
      userId: req.user._id || req.user.id 
    });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid comment ID' 
      });
    }

    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ 
        success: false,
        message: 'Comment not found' 
      });
    }

    // Check authorization
    const isOwner = comment.userId.toString() === (req.user._id || req.user.id).toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized' 
      });
    }

    await comment.deleteOne();
    console.log('✅ Comment deleted:', req.params.id);

    res.json({ 
      success: true,
      message: 'Comment deleted' 
    });
  } catch (err) {
    console.error('❌ Delete comment error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete comment',
      error: err.message 
    });
  }
});

module.exports = router;
