const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const { auth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

/* ---------------------------------------------------
   ✅ CREATE NEW COURSE
--------------------------------------------------- */
router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const course = new Course({
      ...req.body,
      instructor: {
        userId: req.user._id,
        name: req.user.name || "Admin",
      },
      status: req.body.status || "draft",
    });

    await course.save();
    res.status(201).json({ success: true, message: "Course created successfully", course });
  } catch (error) {
    console.error("Create course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ GET ALL COURSES (for Admin Dashboard)
--------------------------------------------------- */
router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, courses });
  } catch (error) {
    console.error("Get courses error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ GET SINGLE COURSE (with full contents)
--------------------------------------------------- */
router.get("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    res.status(200).json({ success: true, course });
  } catch (error) {
    console.error("Get course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ UPDATE COURSE DETAILS
--------------------------------------------------- */
router.put("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const updated = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Course not found" });

    res.status(200).json({ success: true, message: "Course updated", course: updated });
  } catch (error) {
    console.error("Update course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ DELETE COURSE
--------------------------------------------------- */
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const deleted = await Course.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Course not found" });

    res.status(200).json({ success: true, message: "Course deleted" });
  } catch (error) {
    console.error("Delete course error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ UNIT ROUTES
--------------------------------------------------- */
// ADD UNIT
router.post("/:courseId/unit", auth, requireAdmin, async (req, res) => {
  try {
    const { title, description, order } = req.body;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const newUnit = {
      unitId: new mongoose.Types.ObjectId().toString(),
      title,
      description: description || "",
      order: order || course.units.length + 1,
      lessons: [],
    };

    course.units.push(newUnit);
    await course.save();

    res.status(201).json({ success: true, message: "Unit added successfully", course });
  } catch (error) {
    console.error("Add unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE UNIT
router.put("/:courseId/unit/:unitId", auth, requireAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const unit = course.units.find((u) => u.unitId === req.params.unitId);
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });

    Object.assign(unit, req.body);
    await course.save();

    res.status(200).json({ success: true, message: "Unit updated successfully", course });
  } catch (error) {
    console.error("Update unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE UNIT
router.delete("/:courseId/unit/:unitId", auth, requireAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    course.units = course.units.filter((u) => u.unitId !== req.params.unitId);
    await course.save();

    res.status(200).json({ success: true, message: "Unit deleted successfully", course });
  } catch (error) {
    console.error("Delete unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------
   ✅ LESSON ROUTES
--------------------------------------------------- */
// ADD LESSON
router.post("/:courseId/unit/:unitId/lesson", auth, requireAdmin, async (req, res) => {
  try {
    const { title, type, content, duration, isPreview, order } = req.body;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const unit = course.units.find((u) => u.unitId === req.params.unitId);
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });

    const newLesson = {
      lessonId: new mongoose.Types.ObjectId().toString(),
      title,
      type,
      content: content || {},
      duration: duration || 0,
      isPreview: isPreview || false,
      order: order || unit.lessons.length + 1,
    };

    unit.lessons.push(newLesson);
    await course.save();

    res.status(201).json({ success: true, message: "Lesson added successfully", course });
  } catch (error) {
    console.error("Add lesson error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE LESSON
router.put("/:courseId/unit/:unitId/lesson/:lessonId", auth, requireAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const unit = course.units.find((u) => u.unitId === req.params.unitId);
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });

    const lesson = unit.lessons.find((l) => l.lessonId === req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found" });

    Object.assign(lesson, req.body);
    await course.save();

    res.status(200).json({ success: true, message: "Lesson updated successfully", course });
  } catch (error) {
    console.error("Update lesson error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE LESSON
router.delete("/:courseId/unit/:unitId/lesson/:lessonId", auth, requireAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const unit = course.units.find((u) => u.unitId === req.params.unitId);
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });

    unit.lessons = unit.lessons.filter((l) => l.lessonId !== req.params.lessonId);
    await course.save();

    res.status(200).json({ success: true, message: "Lesson deleted successfully", course });
  } catch (error) {
    console.error("Delete lesson error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
