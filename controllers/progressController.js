const Progress = require('../models/Progress');

// Helper: simulate code execution against test cases
const runTests = async (code, testCases) => {
  // Mock execution logic (replace with real executor if you integrate one)
  const results = testCases.map((testCase, index) => {
    const passed = Math.random() > 0.3; // simulate pass/fail
    return {
      testCaseId: index + 1,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: passed ? testCase.expectedOutput : testCase.expectedOutput + ' (wrong)',
      passed,
      points: testCase.points || 1
    };
  });

  const testsPassed = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const percentage = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;

  return { results, testsPassed, totalTests, percentage };
};

// Submit coding solution controller
exports.submitCoding = async (req, res) => {
  try {
    const { courseId, lessonId, problemId, code, language, testCases } = req.body;
    const userId = req.user._id;

    if (!courseId || !lessonId || !problemId || !code || !language || !testCases) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Run test cases
    const { results, testsPassed, totalTests, percentage } = await runTests(code, testCases);

    const status = percentage === 100 ? 'passed' : 'failed';
    const executionTime = Math.floor(Math.random() * 5); // mock 0-5 seconds

    // Find or create progress
    let progress = await Progress.findOne({ userId, courseId, lessonId });
    if (!progress) {
      progress = new Progress({ userId, courseId, lessonId });
    }

    // Add coding submission
    const submission = {
      problemId,
      code,
      language,
      status,
      testsPassed,
      totalTests,
      percentage,
      executionTime,
      submittedAt: new Date(),
      testResults: results
    };

    if (!progress.lessonProgress.codingSubmissions) {
      progress.lessonProgress.codingSubmissions = [];
    }

    progress.lessonProgress.codingSubmissions.push(submission);

    // Update overall score (latest submission can define score or average)
    progress.score = submission.percentage;
    progress.maxScore = 100;
    progress.status = submission.percentage === 100 ? 'completed' : 'in_progress';
    progress.lastAccessedAt = new Date();

    await progress.save();

    return res.status(200).json({
      message: 'Coding submission recorded',
      submission,
      overallScore: progress.score
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
