const Course = require("../models/Course"); // your Mongoose model
const defaultCourses = require("./defaultCourses");

async function seedCourses() {
  try {
    const count = await Course.countDocuments();
    if (count === 0) {
      await Course.insertMany(defaultCourses);
      console.log("✅ Default courses seeded!");
    } else {
      console.log("Courses already exist, skipping seeding.");
    }
  } catch (err) {
    console.error("❌ Seeding error:", err);
  }
}

module.exports = seedCourses;
