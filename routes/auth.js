const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/user");
const { sendOtpEmail } = require("../utils/emailSender");

const router = express.Router();

// Temporary OTP store (use Redis in prod)
const otpStore = new Map();

// -------------------- REGISTER --------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "Please provide all required fields" });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser)
      return res.status(400).json({ success: false, message: "User already exists" });

    // DO NOT hash, store plain password here: let Mongoose do it
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email.toLowerCase(), {
      otp,
      name: name.trim(),
      password, // plain password!
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send OTP
    await sendOtpEmail({ to: email, otp, purpose: "signup" });

    res.status(201).json({ success: true, message: "OTP sent to your email for verification" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------- VERIFY OTP --------------------
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, message: "Email and OTP required" });

    const record = otpStore.get(email.toLowerCase());
    if (!record || record.otp !== otp || record.expiresAt < Date.now())
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    // USE plain password, let pre-save hash it once
    const user = await User.create({
      name: record.name,
      email: email.toLowerCase(),
      password: record.password, // plain password only!
      role: "user",
      isVerified: true
    });

    otpStore.delete(email.toLowerCase());

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------- LOGIN --------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!user.isActive) return res.status(400).json({ success: false, message: "Account suspended" });
    if (!user.isVerified) return res.status(403).json({ success: false, message: "Please verify your email first" });

    // Use bcrypt.compare as you do!
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
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
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------- SEND OTP (resend) --------------------
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const record = otpStore.get(email.toLowerCase());
    if (!record) return res.status(404).json({ success: false, message: "No pending OTP found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    record.otp = otp;
    record.expiresAt = Date.now() + 10 * 60 * 1000;
    otpStore.set(email.toLowerCase(), record);

    await sendOtpEmail({ to: email, otp, purpose: "signup" });

    res.status(200).json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// -------------------- FORGOT PASSWORD --------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save({ validateBeforeSave: false });

    // Send email with reset link (not hash)
    await sendOtpEmail({ to: email, otp: resetToken, purpose: "reset" });

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email"
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Failed to send reset link" });
  }
});

// -------------------- RESET PASSWORD --------------------
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    // Hash the token from URL to match with DB
    const resetTokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    // Set plain password—let pre-save handle hashing!
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
