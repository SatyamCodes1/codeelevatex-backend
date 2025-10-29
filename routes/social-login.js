const express = require('express');
const router = express.Router();
const User = require('../models/user');
const jwt = require('jsonwebtoken');

// POST /api/auth/social-login
router.post('/', async (req, res) => {
  try {
    let { email, name, avatar, provider, providerId } = req.body;

    // Validate required fields
    if (!provider || !providerId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // fallback for missing email (common with GitHub)
    if (!email || typeof email !== 'string') {
      email = `${providerId}@${provider}.social`;
    }

    // fallback for missing name
    if (!name || typeof name !== 'string') {
      name = "User";
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user
      const newUserData = {
        name,
        email,
        avatar: avatar || 'default-avatar.png',
        password: Math.random().toString(36).slice(-8), // temporary password
        isVerified: true,
      };

      if (provider === 'google') newUserData.googleId = providerId;
      if (provider === 'github') newUserData.githubId = providerId;

      user = await User.create(newUserData);
    } else {
      // Update providerId if missing
      if (provider === 'google' && !user.googleId) user.googleId = providerId;
      if (provider === 'github' && !user.githubId) user.githubId = providerId;
      await user.save();
    }

    // Sign JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role || "user" }, // include role in token
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send consistent response
    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        role: user.role || "user",
        googleId: user.googleId || undefined,
        githubId: user.githubId || undefined,
      },
      token,
    });

  } catch (err) {
    console.error("Social login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
