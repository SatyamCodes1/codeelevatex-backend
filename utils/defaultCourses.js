// utils/defaultCourses.js

module.exports = [
  {
    title: "Python for Beginners",
    description: "Learn Python basics with hands-on examples",
    icon: "🐍",
    price: 99,
    category: "programming",
    level: "beginner",
    instructor: { userId: null }, // <-- will assign admin _id in server.js
    status: "published",          // <-- ensure always visible
  },
  {
    title: "Advanced Python",
    description: "Master OOP, async, and advanced modules",
    icon: "⚙️",
    price: 199,
    category: "programming",
    level: "advanced",
    instructor: { userId: null },
    status: "published",
  },
  {
    title: "Web Development Bootcamp",
    description: "Learn HTML, CSS, and JavaScript to build websites",
    icon: "🌐",
    price: 299,
    category: "programming",
    level: "intermediate",
    instructor: { userId: null },
    status: "published",
  },
];
