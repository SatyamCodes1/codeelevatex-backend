const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');
const AIMessage = require('../models/AIMessage');

const router = express.Router();

// ✅ Groq API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // ✅ Free working Groq model

// ✅ Function to call Groq AI
async function getGroqResponse(message, context, history) {
  const { lessonTitle, lessonType } = context || {};

  // Build conversation history
  const messages = [
    {
      role: 'system',
      content: `You are a helpful, friendly AI learning assistant for an online education platform. Your job is to help students understand concepts, answer questions, and guide their learning.

${lessonTitle ? `Current lesson: "${lessonTitle}"` : ''}
${lessonType ? `Lesson type: ${lessonType}` : ''}

Guidelines:
- Be clear, concise, and educational
- Use examples and analogies when helpful
- Break down complex topics into simple steps
- Encourage learning by asking clarifying questions
- Use emojis occasionally to make it friendly
- Keep responses under 300 words unless asked for more detail
- If asked about the current lesson topic, provide relevant information`
    }
  ];

  // Add last 5 messages from conversation history
  if (history && history.length > 0) {
    history.slice(0, 5).reverse().forEach(msg => {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: message });

  try {
    console.log('📤 Sending request to Groq...');

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800,
        top_p: 1,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Groq API response received');
    return response.data.choices[0].message.content;

  } catch (error) {
    console.error('❌ Groq API Error Details:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }

    return `I'm having trouble connecting to the AI service right now. Please try again in a moment! 🤝

In the meantime:
- Check lesson examples and explanations
- Ask questions in the comments
- Review practice exercises`;
  }
}

// POST user message & AI reply
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, context } = req.body;
    const { courseId, lessonId } = context || {};

    console.log('='.repeat(60));
    console.log('🤖 AI Chat Request (Groq)');
    console.log('User:', req.user.name || req.user.id);
    console.log('Question:', message);
    console.log('Has API Key:', !!GROQ_API_KEY);
    console.log('='.repeat(60));

    if (!message?.trim()) {
      return res.status(400).json({ response: 'Message required' });
    }

    if (!GROQ_API_KEY) {
      console.error('⚠️ GROQ_API_KEY not found in environment variables');
      return res.status(500).json({
        response: 'AI service not configured. Add GROQ_API_KEY to your .env file.'
      });
    }

    // Save user message
    await AIMessage.create({
      userId: req.user._id || req.user.id,
      courseId,
      lessonId,
      type: 'user',
      content: message.trim(),
    });

    // Fetch last 10 messages as history
    const history = await AIMessage.find({
      userId: req.user._id || req.user.id,
      courseId,
      lessonId
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get AI response from Groq
    const aiResponseText = await getGroqResponse(message, context, history);

    // Save AI response
    const aiMessage = await AIMessage.create({
      userId: req.user._id || req.user.id,
      courseId,
      lessonId,
      type: 'ai',
      content: aiResponseText,
    });

    res.json({ response: aiMessage.content });

  } catch (err) {
    console.error('❌ AI chat error:', err);
    res.status(500).json({
      response: 'Failed to generate AI response. Please try again.'
    });
  }
});

// GET conversation history
router.get('/history/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const lessonId = req.query.lessonId;

    const filter = { userId: req.user._id || req.user.id, courseId };
    if (lessonId) filter.lessonId = lessonId;

    const messages = await AIMessage.find(filter).sort({ createdAt: 1 });
    res.json({ messages });

  } catch (err) {
    console.error('❌ AI history error:', err);
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
});

module.exports = router;
