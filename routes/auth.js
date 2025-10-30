const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/user");
const { sendOtpEmail } = require("../utils/emailSender");

const router = express.Router();

// Temporary OTP store (use Redis in prod)
const otpStore = new Map();

// -------------------- MIDDLEWARE: Verify JWT --------------------
const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err.message);
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

// -------------------- REGISTER --------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email.toLowerCase(), {
      otp,
      name: name.trim(),
      password, // plain password - let Mongoose pre-save hook hash it
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    // Send OTP email
    await sendOtpEmail({ to: email, otp, purpose: "signup" });

    res.status(201).json({
      success: true,
      message: "OTP sent to your email for verification"
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ success: false, message: "Server error during registration" });
  }
});

// -------------------- VERIFY OTP --------------------
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validation
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP required"
      });
    }

    // Get OTP record
    const record = otpStore.get(email.toLowerCase());
    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please register first"
      });
    }

    // Check OTP validity
    if (record.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    if (record.expiresAt < Date.now()) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one"
      });
    }

    // Create user with plain password (pre-save hook will hash it)
    const user = await User.create({
      name: record.name,
      email: email.toLowerCase(),
      password: record.password, // plain password
      role: "user",
      isVerified: true,
      isActive: true,
      lastLogin: new Date()
    });

    // Clean up OTP store
    otpStore.delete(email.toLowerCase());

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Account created and verified successfully",
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    otpStore.delete(email.toLowerCase());
    res.status(500).json({ success: false, message: "Server error during OTP verification" });
  }
});

// -------------------- LOGIN --------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    // Find user with password field
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is suspended. Please contact support"
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first"
      });
    }

    // Compare passwords
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
});

// -------------------- GET CURRENT USER (NEW - FIX FOR PAGE REFRESH) --------------------
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is suspended"
      });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        googleId: user.googleId,
        githubId: user.githubId,
        isActive: user.isActive
      }
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ success: false, message: "Server error fetching user" });
  }
});

// -------------------- SEND OTP (RESEND) --------------------
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });

    // If user already registered, this is a password reset request
    if (user) {
      return res.status(400).json({
        success: false,
        message: "Email already registered. Use forgot password instead"
      });
    }

    // Get existing OTP record
    const record = otpStore.get(email.toLowerCase());

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "No pending registration found. Please register first"
      });
    }

    // Generate new OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    record.otp = newOtp;
    record.expiresAt = Date.now() + 10 * 60 * 1000; // Reset expiry
    otpStore.set(email.toLowerCase(), record);

    // Send OTP email
    await sendOtpEmail({ to: email, otp: newOtp, purpose: "signup" });

    res.status(200).json({
      success: true,
      message: "OTP sent successfully"
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// -------------------- FORGOT PASSWORD --------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email"
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Save token hash and expiry to database
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save({ validateBeforeSave: false });

    // Send email with reset link (send plain token, not hash)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendOtpEmail({
      to: email,
      otp: resetToken,
      purpose: "reset",
      resetUrl
    });

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email"
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Failed to send password reset link" });
  }
});

// -------------------- RESET PASSWORD --------------------
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    // Validation
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirmation required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    // Hash the token from URL to compare with stored hash
    const resetTokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired password reset link"
      });
    }

    // Set plain password (pre-save hook will hash it)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token for auto-login after reset
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error resetting password" });
  }
});

// -------------------- SOCIAL LOGIN --------------------
router.post("/social-login", async (req, res) => {
  try {
    const { email, name, avatar, provider, providerId } = req.body;

    // Validation
    if (!email || !name || !provider || !providerId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Create new user from social login
      user = await User.create({
        name,
        email: email.toLowerCase(),
        avatar,
        isVerified: true,
        isActive: true,
        lastLogin: new Date(),
        [provider === "google" ? "googleId" : "githubId"]: providerId,
        password: crypto.randomBytes(16).toString("hex") // Random password for social users
      });
    } else {
      // Update social ID if not already set
      if (provider === "google" && !user.googleId) {
        user.googleId = providerId;
      } else if (provider === "github" && !user.githubId) {
        user.githubId = providerId;
      }

      // Update avatar if provided
      if (avatar) {
        user.avatar = avatar;
      }

      user.lastLogin = new Date();
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Social login successful",
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        googleId: user.googleId,
        githubId: user.githubId
      }
    });
  } catch (err) {
    console.error("Social login error:", err);
    res.status(500).json({ success: false, message: "Social login failed" });
  }
});

// -------------------- LOGOUT --------------------
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // Optional: Add token to blacklist (implement if needed)
    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
});

module.exports = router;
