// routes/courses.js - COMPLETE FIXED VERSION (NO ENROLLMENT ROUTES)

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");  // ✅ ADD THIS
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const Progress = require("../models/Progress");
const { auth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

// -------------------- PUBLIC ROUTES --------------------

// ✅ GET all published courses
router.get("/", async (req, res) => {
  try {
    const {
      category,
      level,
      search,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 12,
    } = req.query;

    const filter = { status: "published" };
    if (category && category !== "all") filter.category = category;
    if (level && level !== "all") filter.level = level;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    // ✅ Check Authorization header properly
    const authHeader = req.header("Authorization");
    const hasAuth = authHeader && authHeader.startsWith("Bearer");
    
    console.log("📖 GET /courses - Auth Check:", {
      hasAuthHeader: !!authHeader,
      hasAuth
    });
    
    let query = Course.find(filter)
      .sort(sortObj)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("instructor.userId", "name");

    // ✅ Only exclude content for unauthenticated users
    if (!hasAuth) {
      query = query.select("-units.lessons.content");
    }

    const courses = await query.lean();

    console.log("📖 GET /courses - Returning:", {
      count: courses.length,
      hasAuth,
      firstCourse: courses[0]?._id,
      hasContent: !!courses[0]?.units?.[0]?.lessons?.[0]?.content
    });

    const totalCourses = await Course.countDocuments(filter);

    res.status(200).json({
      success: true,
      courses: courses || [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCourses / limit),
        totalCourses,
        hasMore: page * limit < totalCourses,
      },
    });
  } catch (error) {
    console.error("❌ Get courses error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ GET single course (public) - INCLUDE FULL CONTENT
router.get("/:id", async (req, res) => {
  try {
    const { id: courseId } = req.params;
    
    // ✅ CRITICAL FIX: Get userId from JWT token
    let userId = null;
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        console.log("✅ User authenticated:", userId);
      } catch (err) {
        console.log("⚠️ Token verification failed:", err.message);
      }
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid course ID" });
    }

    const course = await Course.findById(courseId)
      .populate("instructor.userId", "name")
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    console.log("📖 GET COURSE - Full Content:", {
      courseId: course._id,
      unitsCount: course.units?.length,
      lessonsCount: course.units?.[0]?.lessons?.length,
      firstLessonContent: course.units?.[0]?.lessons?.[0]?.content
    });

    let enrollment = null;
    let userProgress = [];

    if (userId) {
      enrollment = await Enrollment.findOne({
        userId,
        courseId,
        status: { $in: ["active", "completed"] },
      }).lean();

      console.log("🔍 Enrollment check:", {
        userId,
        courseId,
        enrollmentFound: !!enrollment,
        accessLevel: enrollment?.accessLevel
      });

      if (enrollment) {
        userProgress = await Progress.find({ userId, courseId }).lean();
      }
    }

    // Only show preview lessons if not enrolled
    if (!enrollment || enrollment.accessLevel !== "full") {
      console.log("⚠️ User not enrolled - filtering to preview lessons only");
      const originalLessonCount = course.units?.reduce((acc, unit) => acc + (unit.lessons?.length || 0), 0) || 0;
      
      course.units = course.units.map((unit) => ({
        ...unit,
        lessons: unit.lessons.filter((lesson) => lesson.isPreview),
      }));
      
      const filteredLessonCount = course.units?.reduce((acc, unit) => acc + (unit.lessons?.length || 0), 0) || 0;
      console.log(`📊 Filtered lessons: ${originalLessonCount} → ${filteredLessonCount}`);
    } else {
      console.log("✅ User enrolled with full access - showing all lessons");
    }

    res.status(200).json({
      success: true,
      course,
      enrollment,
      userProgress,
    });
  } catch (error) {
    console.error("❌ Get course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------- ADMIN ROUTES --------------------

// ✅ POST create course (auto-published)
router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    console.log("📝 CREATE COURSE:", req.body);
    
    const course = await Course.create({
      ...req.body,
      instructor: { 
        userId: req.user._id, 
        name: req.user.name 
      },
      status: "published",
    });
    
    console.log("✅ COURSE CREATED:", course._id);
    res.status(201).json({ success: true, course });
  } catch (error) {
    console.error("❌ Create course error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// ✅ PUT update course
router.put("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { id: courseId } = req.params;
    
    console.log("=".repeat(60));
    console.log("📥 UPDATE COURSE REQUEST");
    console.log("=".repeat(60));
    console.log("Course ID:", courseId);
    console.log("Request Body Keys:", Object.keys(req.body));
    console.log("Has Units:", !!req.body.units);
    console.log("Units Count:", req.body.units?.length);
    
    if (req.body.units && req.body.units.length > 0) {
      console.log("First Unit:", {
        unitId: req.body.units[0].unitId,
        title: req.body.units[0].title,
        lessonsCount: req.body.units[0].lessons?.length
      });
      
      if (req.body.units[0].lessons && req.body.units[0].lessons.length > 0) {
        const firstLesson = req.body.units[0].lessons[0];
        console.log("First Lesson:", {
          lessonId: firstLesson.lessonId,
          title: firstLesson.title,
          hasContent: !!firstLesson.content,
          contentKeys: Object.keys(firstLesson.content || {})
        });
        
        if (firstLesson.content) {
          console.log("Lesson Content:", {
            explanations: firstLesson.content.explanation?.length || 0,
            examples: firstLesson.content.examples?.length || 0,
            quizzes: firstLesson.content.quiz?.length || 0,
            coding: firstLesson.content.coding?.length || 0
          });
          
          if (firstLesson.content.explanation && firstLesson.content.explanation.length > 0) {
            console.log("First Explanation:", firstLesson.content.explanation[0]);
          }
          if (firstLesson.content.quiz && firstLesson.content.quiz.length > 0) {
            console.log("First Quiz Question:", firstLesson.content.quiz[0]);
          }
        }
      }
    }
    console.log("=".repeat(60));
    
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID" 
      });
    }

    const course = await Course.findById(courseId);
    
    if (!course) {
      console.log("❌ COURSE NOT FOUND:", courseId);
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    console.log("✅ Course found:", course._id);

    if (req.body.title !== undefined) course.title = req.body.title;
    if (req.body.description !== undefined) course.description = req.body.description;
    if (req.body.price !== undefined) course.price = req.body.price;
    if (req.body.category !== undefined) course.category = req.body.category;
    if (req.body.level !== undefined) course.level = req.body.level;
    if (req.body.thumbnail !== undefined) course.thumbnail = req.body.thumbnail;
    if (req.body.language !== undefined) course.language = req.body.language;

    if (req.body.units) {
      console.log("🔄 Updating units array...");
      course.units = req.body.units;
      course.markModified('units');
      console.log("✅ Units marked as modified");
    }

    console.log("💾 Saving course...");
    await course.save();
    console.log("✅ Course saved successfully!");
    
    const savedCourse = await Course.findById(courseId).lean();
    console.log("=".repeat(60));
    console.log("📤 SAVED COURSE VERIFICATION");
    console.log("=".repeat(60));
    console.log("Units Count:", savedCourse.units?.length);
    
    if (savedCourse.units && savedCourse.units.length > 0) {
      console.log("First Unit Lessons:", savedCourse.units[0].lessons?.length);
      
      if (savedCourse.units[0].lessons && savedCourse.units[0].lessons.length > 0) {
        const firstLesson = savedCourse.units[0].lessons[0];
        console.log("First Lesson Content:", {
          hasContent: !!firstLesson.content,
          hasExplanation: !!firstLesson.content?.explanation,
          hasExamples: !!firstLesson.content?.examples,
          hasQuiz: !!firstLesson.content?.quiz,
          hasCoding: !!firstLesson.content?.coding,
          explanationCount: firstLesson.content?.explanation?.length || 0,
          examplesCount: firstLesson.content?.examples?.length || 0,
          quizCount: firstLesson.content?.quiz?.length || 0,
          codingCount: firstLesson.content?.coding?.length || 0
        });
        
        if (firstLesson.content) {
          console.log("ACTUAL CONTENT:", JSON.stringify(firstLesson.content, null, 2));
        }
      }
    }
    console.log("=".repeat(60));

    res.status(200).json({ success: true, course: savedCourse });
    
  } catch (error) {
    console.error("=".repeat(60));
    console.error("❌ UPDATE COURSE ERROR");
    console.error("=".repeat(60));
    console.error("Error:", error);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60));
    
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// ✅ DELETE course
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { id: courseId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID" 
      });
    }

    const course = await Course.findByIdAndDelete(courseId);
    
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    console.log("✅ Course deleted:", courseId);
    res.status(200).json({ success: true, message: "Course deleted" });
  } catch (error) {
    console.error("❌ Delete course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
