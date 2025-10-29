const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const router = express.Router();
const transporter = require("../utils/mailer");
const User = require("../models/user");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Define sender email from env or default
const FROM_EMAIL = process.env.FROM_EMAIL || "no-reply@codeelevatex.sbs";
const FROM_NAME = process.env.FROM_NAME || "codeElevateX";
const SENDER = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// Helper function to send emails with explicit from address
const sendEmail = async (to, subject, html, fromEmail) => {
  try {
    console.log("📧 Sending email to:", to);
    console.log("   Subject:", subject);
    console.log("   From:", fromEmail);

    const mailOptions = {
      from: fromEmail,
      to: to,
      subject: subject,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log("   Message ID:", info.messageId);
    console.log("   Response:", info.response);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ Error sending email:", err.message);
    console.error("   Full error:", err);
    return { success: false, error: err.message };
  }
};

// -------------------------
// 1️⃣ Create Razorpay Order
// -------------------------
router.post("/create-order", express.json(), async (req, res) => {
  const { amount, currency, courseId, userId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Amount must be greater than 0" });
  }

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const options = {
      amount: Math.round(amount * 100),
      currency: currency || "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: userId,
        courseId: courseId || "",
        timestamp: new Date().toISOString(),
      },
    };

    const order = await razorpay.orders.create(options);
    console.log("✅ Razorpay order created:", order.id);
    res.json(order);
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// 2️⃣ Verify Payment & Send Emails
// -------------------------
router.post("/verify-payment", express.json(), async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature, 
    userId,
    courseId 
  } = req.body;

  console.log("============================================================");
  console.log("💳 PAYMENT VERIFICATION REQUEST");
  console.log("============================================================");
  console.log("Order ID:", razorpay_order_id);
  console.log("Payment ID:", razorpay_payment_id);
  console.log("User ID:", userId);
  console.log("Course ID:", courseId);
  console.log("============================================================");

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    console.error("❌ Missing payment details");
    return res.status(400).json({ error: "Missing payment details" });
  }

  if (!userId) {
    console.error("❌ Missing user ID");
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("❌ Invalid signature");
      return res.status(400).json({ error: "Invalid signature. Payment verification failed" });
    }

    console.log("✅ Payment signature verified");

    // Fetch payment details from Razorpay
    let amount = 0;
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      amount = payment.amount / 100;
      console.log("✅ Payment amount fetched from Razorpay:", amount);
    } catch (paymentFetchErr) {
      console.error("⚠️ Could not fetch payment from Razorpay:", paymentFetchErr);
    }

    // Fetch user details from DB
    const user = await User.findById(userId).select('name email');
    if (!user) {
      console.error("❌ User not found in database");
      return res.status(404).json({ error: "User not found" });
    }

    console.log("✅ User details fetched:", user.name, user.email);

    // Fetch course details if courseId is provided
    let courseDetails = null;
    if (courseId) {
      courseDetails = await Course.findById(courseId).select('title description icon units');
      console.log("✅ Course details fetched:", courseDetails?.title);

      // Create or update enrollment with payment info
      try {
        const existingEnrollment = await Enrollment.findOne({
          userId: userId,
          courseId: courseId,
        });

        if (!existingEnrollment) {
          const newEnrollment = await Enrollment.create({
            userId: userId,
            courseId: courseId,
            enrolledAt: new Date(),
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            amountPaid: amount,
            paymentStatus: 'paid',
            paymentMethod: 'razorpay',
            status: 'active',
            accessLevel: 'full',
          });
          console.log("✅ Enrollment record created with status: 'active' & payment info");
        } else {
          console.log("⚠️ User already enrolled in this course");
          if (existingEnrollment.status !== 'active' || existingEnrollment.paymentStatus !== 'paid' || existingEnrollment.amountPaid !== amount) {
            existingEnrollment.status = 'active';
            existingEnrollment.accessLevel = 'full';
            existingEnrollment.paymentStatus = 'paid';
            existingEnrollment.amountPaid = amount;
            existingEnrollment.paymentMethod = 'razorpay';
            await existingEnrollment.save();
            console.log("✅ Updated enrollment status to 'active' & payment info");
          }
        }
      } catch (enrollmentErr) {
        console.error("❌ Error creating enrollment:", enrollmentErr);
      }
    }

    // 1. Send Payment Success Email
    console.log("\n📧 === SENDING PAYMENT EMAIL ===");
    const paymentEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #667eea; margin: 0;">codeElevateX</h1>
    </div>
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 24px;">✅ Payment Successful!</h2>
    </div>
    
    <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi <strong>${user.name}</strong>,</p>
    
    <p style="font-size: 16px; color: #333; line-height: 1.6;">
      Thank you for your payment! We have successfully received your transaction for codeElevateX.
    </p>
    
    <div style="background: #f9f9f9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; border-radius: 5px;">
      <h3 style="margin: 0 0 15px 0; color: #333;">Payment Details:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Amount Paid:</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: bold;">₹${amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Payment ID:</td>
          <td style="padding: 8px 0; text-align: right; color: #666; font-size: 12px;">${razorpay_payment_id}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Order ID:</td>
          <td style="padding: 8px 0; text-align: right; color: #666; font-size: 12px;">${razorpay_order_id}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Date:</td>
          <td style="padding: 8px 0; text-align: right; color: #333;">${new Date().toLocaleDateString('en-IN')}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Go to Dashboard
      </a>
    </div>
    
    <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
    
    <p style="font-size: 12px; color: #999;">
      If you have any questions, please contact our support team.<br>
      © ${new Date().getFullYear()} codeElevateX. All rights reserved.
    </p>
  </div>
</body>
</html>
    `;

    const paymentEmailResult = await sendEmail(
      user.email,
      "Payment Successful - codeElevateX",
      paymentEmailHtml,
      SENDER
    );

    // 2. Send Course Enrollment Email
    let enrollmentEmailResult = { success: false };
    if (courseDetails) {
      console.log("\n📧 === SENDING ENROLLMENT EMAIL ===");

      const totalLessons = courseDetails.units.reduce((sum, unit) => sum + unit.lessons.length, 0);

      const enrollmentEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #667eea; margin: 0;">codeElevateX</h1>
    </div>
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 24px;">🎉 Welcome to ${courseDetails.title}!</h2>
    </div>
    
    <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi <strong>${user.name}</strong>,</p>
    
    <p style="font-size: 16px; color: #333; line-height: 1.6;">
      Congratulations! You have successfully enrolled in <strong>${courseDetails.title}</strong>. Start your learning journey now!
    </p>
    
    <div style="background: #f9f9f9; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 5px;">
      <h3 style="margin: 0 0 15px 0; color: #333;">Course Details:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Course Name:</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: bold;">${courseDetails.title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Total Units:</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: bold;">${courseDetails.units.length}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Total Lessons:</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: bold;">${totalLessons}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/course/${courseDetails._id}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Start Learning Now
      </a>
    </div>
    
    <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
    
    <p style="font-size: 12px; color: #999;">
      If you have any questions, please contact our support team.<br>
      © ${new Date().getFullYear()} codeElevateX. All rights reserved.
    </p>
  </div>
</body>
</html>
      `;

      enrollmentEmailResult = await sendEmail(
        user.email,
        `Welcome to ${courseDetails.title} - codeElevateX`,
        enrollmentEmailHtml,
        SENDER
      );
    }

    console.log("\n============================================================");
    console.log("📊 EMAIL SENDING SUMMARY:");
    console.log("   Payment email:", paymentEmailResult.success ? "✅ SENT" : "❌ FAILED");
    console.log("   Enrollment email:", enrollmentEmailResult.success ? "✅ SENT" : "❌ FAILED");
    console.log("============================================================\n");

    res.json({ 
      success: true, 
      message: "Payment verified successfully",
      enrollmentCreated: !!courseDetails,
      emailsSent: {
        payment: paymentEmailResult.success,
        enrollment: enrollmentEmailResult.success
      }
    });
  } catch (err) {
    console.error("❌ Payment verification error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// -------------------------
// 3️⃣ Razorpay Webhook
// -------------------------
router.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(req.body.toString())
      .digest("hex");

    if (signature !== expectedSignature) {
      console.log("❌ Invalid Razorpay Webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    console.log("✅ Razorpay Webhook Event:", payload.event);

    if (payload.event === "payment.captured") {
      const payment = payload.payload.payment.entity;
      const amount = payment.amount / 100;
      const paymentId = payment.id;

      console.log(`💰 Payment Captured: ₹${amount} (ID: ${paymentId})`);
    }

    res.status(200).json({ status: "success" });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ message: "Webhook handling failed" });
  }
});

module.exports = router;
