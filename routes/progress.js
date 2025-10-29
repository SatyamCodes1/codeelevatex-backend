const express = require('express');
const Progress = require('../models/Progress');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ---------------- GET COURSE PROGRESS ----------------
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      userId: req.user.id,
      courseId,
      status: { $in: ['active', 'completed'] },
    });

    if (!enrollment) 
      return res.status(403).json({ message: 'Not enrolled in this course' });

    // Fetch progress records for all lessons
    const progressRecords = await Progress.find({ userId: req.user.id, courseId });

    // Fetch course details
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const totalLessons = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
    const completedLessons = progressRecords.filter(p => p.status === 'completed').length;
    const totalTimeSpent = progressRecords.reduce((sum, p) => sum + (p.timeSpent || 0), 0);

    const overallProgress = {
      courseId,
      courseName: course.title,
      totalLessons,
      completedLessons,
      overallPercentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      totalTimeSpent: Math.round(totalTimeSpent / 60),
      estimatedTimeRemaining: Math.max(0, (course.totalDuration || 0) - Math.round(totalTimeSpent / 60)),
      currentUnit: enrollment.progress?.currentUnit || course.units[0]?.unitId,
      currentLesson: enrollment.progress?.currentLesson || course.units[0]?.lessons[0]?.lessonId,
      lastAccessed: enrollment.progress?.lastAccessed,
      detailedProgress: progressRecords, // ✅ send detailedProgress for frontend TS
    };

    res.json({ progress: overallProgress });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Failed to get progress' });
  }
});

// ---------------- UPDATE LESSON PROGRESS ----------------
router.post('/lesson/:lessonId', auth, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { courseId, status = 'completed', timeSpent = 0, score, quizAnswers, codingSubmission } = req.body;

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      userId: req.user.id,
      courseId,
      status: { $in: ['active', 'completed'] },
    });
    if (!enrollment)
      return res.status(403).json({ message: 'Not enrolled in this course' });

    // Find or create progress record
    let progress = await Progress.findOne({ userId: req.user.id, courseId, lessonId });
    if (!progress) {
      progress = new Progress({
        userId: req.user.id,
        courseId,
        lessonId,
        status: 'not_started',
        timeSpent: 0,
        startedAt: new Date(),
        lessonProgress: {},
      });
    }

    // Update basic progress
    progress.status = status;
    progress.timeSpent += timeSpent;
    progress.lastAccessedAt = new Date();
    if (status === 'completed' && !progress.completedAt) progress.completedAt = new Date();

    // Quiz attempts
    if (quizAnswers) {
      const attempt = {
        attemptId: new Date().getTime().toString(),
        answers: quizAnswers,
        score: score || 0,
        submittedAt: new Date(),
        timeSpent,
      };
      progress.lessonProgress.quizAttempts = progress.lessonProgress.quizAttempts || [];
      progress.lessonProgress.quizAttempts.push(attempt);
      progress.score = score || 0;
    }

    // Coding submissions
    if (codingSubmission) {
      const submission = {
        problemId: codingSubmission.problemId,
        code: codingSubmission.code,
        language: codingSubmission.language,
        status: codingSubmission.status || 'pending',
        testsPassed: codingSubmission.testsPassed || 0,
        totalTests: codingSubmission.totalTests || 0,
        percentage: codingSubmission.percentage || 0,
        executionTime: codingSubmission.executionTime || 0,
        testResults: codingSubmission.testResults || [],
        submittedAt: new Date(),
      };
      progress.lessonProgress.codingSubmissions = progress.lessonProgress.codingSubmissions || [];
      progress.lessonProgress.codingSubmissions.push(submission);

      progress.score = submission.percentage;
      progress.maxScore = 100;
      progress.status = submission.percentage === 100 ? 'completed' : 'in_progress';
    }

    await progress.save();

    // Update enrollment progress
    enrollment.progress = enrollment.progress || { completedLessons: [], totalProgress: 0, timeSpent: 0 };
    if (status === 'completed') {
      enrollment.progress.completedLessons = [
        ...new Set([...(enrollment.progress.completedLessons || []), lessonId])
      ];
      enrollment.progress.lastAccessed = new Date();
      enrollment.progress.timeSpent += timeSpent;

      const course = await Course.findById(courseId);
      const totalLessons = course.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
      enrollment.progress.totalProgress = Math.round(
        (enrollment.progress.completedLessons.length / totalLessons) * 100
      );

      await enrollment.save();
    }

    res.json({ message: 'Progress updated successfully', progress });

  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Failed to update progress' });
  }
});

// ---------------- DASHBOARD STATS ----------------
router.get('/dashboard', auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.user.id, status: { $in: ['active', 'completed'] } })
      .populate('courseId', 'title thumbnail category');

    const stats = {
      totalCourses: enrollments.length,
      completedCourses: enrollments.filter(e => e.status === 'completed').length,
      activeCourses: enrollments.filter(e => e.status === 'active').length,
      totalTimeSpent: enrollments.reduce((sum, e) => sum + (e.progress.timeSpent || 0), 0),
      averageProgress: enrollments.length > 0
        ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress.totalProgress || 0), 0) / enrollments.length)
        : 0,
      recentActivity: enrollments
        .filter(e => e.progress.lastAccessed)
        .sort((a, b) => new Date(b.progress.lastAccessed) - new Date(a.progress.lastAccessed))
        .slice(0, 5)
        .map(e => ({
          courseId: e.courseId._id,
          courseName: e.courseId.title,
          thumbnail: e.courseId.thumbnail,
          progress: e.progress.totalProgress,
          lastAccessed: e.progress.lastAccessed,
        })),
    };

    res.json({ stats });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'Failed to get dashboard stats' });
  }
});

module.exports = router;
