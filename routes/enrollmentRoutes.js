const express = require('express');
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/user');  // ✅ ADD THIS
const { auth } = require('../middleware/auth');

const router = express.Router();

// -------------------- ENROLLMENT ROUTES --------------------

// ✅ POST enroll in course - AUTO ENROLLMENT AFTER PAYMENT
router.post('/:courseId/enroll', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { paymentMethod, amountPaid, payment, razorpay_order_id, razorpay_payment_id } = req.body;

    console.log("=".repeat(60));
    console.log("🎓 ENROLLMENT REQUEST");
    console.log("=".repeat(60));
    console.log("User ID:", req.user._id);
    console.log("User Email:", req.user.email);
    console.log("Course ID:", courseId);
    console.log("Payment Data:", {
      paymentMethod,
      amountPaid,
      hasPaymentInfo: !!payment,
      razorpay_order_id,
      razorpay_payment_id
    });
    console.log("=".repeat(60));

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log("❌ Invalid course ID format");
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    // ✅ Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      console.log("❌ Course not found:", courseId);
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    console.log("✅ Course found:", course.title);

    // ✅ Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ 
      userId: req.user._id, 
      courseId 
    });
    
    if (existingEnrollment) {
      console.log("ℹ️ User already enrolled");
      
      // ✅ Ensure user's enrolledCourses array is synced
      await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { enrolledCourses: courseId } }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Already enrolled',
        enrollment: existingEnrollment
      });
    }

    // ✅ Create new enrollment
    console.log("📝 Creating new enrollment...");
    
    const enrollment = new Enrollment({
      userId: req.user._id,
      courseId,
      paymentStatus: 'paid',
      paymentMethod: paymentMethod || 'razorpay',
      amountPaid: amountPaid || course.price,
      accessLevel: 'full', // ✅ CRITICAL: Give full access
      status: 'active',
      progress: {
        completedLessons: [],
        currentLesson: course.units?.[0]?.lessons?.[0]?.lessonId || null,
        totalProgress: 0,
        timeSpent: 0,
        lastAccessed: new Date()
      }
    });

    await enrollment.save();
    console.log("✅ Enrollment saved:", enrollment._id);

    // ✅ CRITICAL: Update user's enrolledCourses array
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { enrolledCourses: courseId } }  // $addToSet prevents duplicates
    );
    console.log("✅ User enrolledCourses array updated");

    // ✅ Update course enrollment count
    await Course.findByIdAndUpdate(courseId, { $inc: { totalEnrollments: 1 } });
    console.log("✅ Course enrollment count updated");

    console.log("=".repeat(60));
    console.log("🎉 ENROLLMENT SUCCESSFUL");
    console.log("Enrollment ID:", enrollment._id);
    console.log("Access Level:", enrollment.accessLevel);
    console.log("Status:", enrollment.status);
    console.log("=".repeat(60));

    res.status(201).json({ 
      success: true, 
      message: 'Successfully enrolled', 
      enrollment 
    });
  } catch (error) {
    console.error("=".repeat(60));
    console.error("❌ ENROLLMENT ERROR");
    console.error("=".repeat(60));
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error("=".repeat(60));
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// ✅ GET all enrollments for the current user
router.get('/my/enrollments', auth, async (req, res) => {
  try {
    console.log("📚 Fetching enrollments for user:", req.user._id);
    
    const enrollments = await Enrollment.find({
      userId: req.user._id,
      status: { $in: ['active', 'completed'] }
    })
      .populate('courseId', 'title description price units totalEnrollments')
      .lean();

    console.log("✅ Found enrollments:", enrollments.length);

    const normalized = enrollments.map(e => ({
      ...e,
      courseId: e.courseId?._id || e.courseId
    }));

    res.status(200).json({ success: true, enrollments: normalized });
  } catch (error) {
    console.error('❌ Get enrollments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ PATCH update lesson progress
router.patch('/:enrollmentId/progress', auth, async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(enrollmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid enrollment ID' });
    }

    const { lessonId, progressData } = req.body;
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    if (!enrollment.userId.equals(req.user._id)) return res.status(403).json({ success: false, message: 'Not authorized' });

    if (lessonId && !enrollment.progress.completedLessons.includes(lessonId)) {
      enrollment.progress.completedLessons.push(lessonId);
    }

    if (progressData?.currentLesson) enrollment.progress.currentLesson = progressData.currentLesson;
    if (typeof progressData?.totalProgress === 'number') enrollment.progress.totalProgress = progressData.totalProgress;
    if (typeof progressData?.timeSpent === 'number') enrollment.progress.timeSpent = progressData.timeSpent;
    enrollment.progress.lastAccessed = new Date();

    await enrollment.save();
    
    console.log("✅ Progress updated for enrollment:", enrollmentId);
    
    res.status(200).json({ success: true, message: 'Progress updated', enrollment });
  } catch (error) {
    console.error('❌ Update progress error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ DELETE enrollment (for testing/development)
router.delete('/:enrollmentId', auth, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(enrollmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid enrollment ID' });
    }
    
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    
    // Check if user owns this enrollment
    if (!enrollment.userId.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // Remove enrollment
    await Enrollment.findByIdAndDelete(enrollmentId);
    
    // Remove from user's enrolledCourses array
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { enrolledCourses: enrollment.courseId } }
    );
    
    // Decrease course enrollment count
    await Course.findByIdAndUpdate(enrollment.courseId, { $inc: { totalEnrollments: -1 } });
    
    console.log("✅ Enrollment deleted:", enrollmentId);
    res.status(200).json({ success: true, message: 'Enrollment deleted' });
  } catch (error) {
    console.error('❌ Delete enrollment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
