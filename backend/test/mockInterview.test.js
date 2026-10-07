const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const express = require("express");
const jwt = require("jsonwebtoken");
const { test } = require("node:test");
const User = require("../models/User");
const AIAnalysis = require("../models/AIAnalysis");
const geminiService = require("../services/geminiService");
const aiRoutes = require("../routes/aiRoutes");

test("mock interview routes authenticate students and validate generated content", async (t) => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalUserFindById = User.findById;
  const originalAnalysisFindOne = AIAnalysis.findOne;
  const originalGenerate = geminiService.generateStructuredContent;
  const jwtSecret = crypto.randomBytes(48).toString("hex");
  process.env.JWT_SECRET = jwtSecret;
  let role = "student";
  let malformedResponse = false;
  let generationCalls = 0;

  User.findById = () => ({
    select: async () => ({ _id: "student-id", role, isActive: true }),
  });
  AIAnalysis.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => ({
      skills: ["JavaScript"],
      technicalSkills: ["React"],
      softSkills: ["Communication"],
    }),
  });
  geminiService.generateStructuredContent = async (_prompt, schema) => {
    generationCalls += 1;
    if (malformedResponse) return { unexpected: "response" };
    if (schema.properties.question) {
      return {
        question: "How would you explain component state management?",
        category: "technical",
        difficulty: "medium",
      };
    }
    return {
      score: 8,
      strengths: ["Clear explanation"],
      weaknesses: ["Could mention trade-offs"],
      feedback: "Your answer is clear and relevant.",
      improvementSuggestions: ["Compare alternative approaches."],
    };
  };

  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  const server = http.createServer(app);

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api/ai/mock-interview`;
    const request = async (path, body, token) => {
      const response = await fetch(`${baseUrl}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const studentToken = jwt.sign({ id: "student-id" }, jwtSecret);
    const companyToken = jwt.sign({ id: "company-id" }, jwtSecret);

    await t.test("unauthenticated and non-student callers are rejected", async () => {
      const unauthenticated = await request("start", {
        interviewType: "technical",
        targetRole: "Frontend Developer",
      });
      assert.equal(unauthenticated.status, 401);

      role = "company";
      const company = await request(
        "start",
        { interviewType: "technical", targetRole: "Frontend Developer" },
        companyToken
      );
      assert.equal(company.status, 403);
      role = "student";
    });

    await t.test("invalid request bodies are rejected before calling Gemini", async () => {
      const before = generationCalls;
      const invalid = await request(
        "start",
        { interviewType: "unrestricted", targetRole: "Frontend Developer" },
        studentToken
      );
      assert.equal(invalid.status, 400);
      assert.equal(generationCalls, before);
    });

    await t.test("valid interview questions and evaluations are returned", async () => {
      const start = await request(
        "start",
        { interviewType: "technical", targetRole: "Frontend Developer" },
        studentToken
      );
      assert.equal(start.status, 200);
      assert.equal(start.body.data.question.question, "How would you explain component state management?");
      assert.equal(start.body.data.questionNumber, 1);
      assert.equal(start.body.data.totalQuestions, 5);

      const answer = await request(
        "answer",
        {
          interviewType: "technical",
          targetRole: "Frontend Developer",
          question: start.body.data.question.question,
          answer: "I would explain how state changes update the rendered component.",
        },
        studentToken
      );
      assert.equal(answer.status, 200);
      assert.deepEqual(answer.body.data, {
        score: 8,
        strengths: ["Clear explanation"],
        weaknesses: ["Could mention trade-offs"],
        feedback: "Your answer is clear and relevant.",
        improvementSuggestions: ["Compare alternative approaches."],
      });

      const next = await request(
        "next-question",
        {
          interviewType: "technical",
          targetRole: "Frontend Developer",
          questionNumber: 2,
          previousQuestions: [start.body.data.question.question],
        },
        studentToken
      );
      assert.equal(next.status, 200);
      assert.equal(next.body.data.questionNumber, 2);
    });

    await t.test("malformed Gemini response is rejected without exposing provider data", async () => {
      malformedResponse = true;
      const result = await request(
        "start",
        { interviewType: "technical", targetRole: "Frontend Developer" },
        studentToken
      );
      assert.equal(result.status, 502);
      assert.equal(result.body.success, false);
      assert.match(result.body.message, /invalid mock interview response/i);
      assert.equal(JSON.stringify(result.body).includes("GEMINI_API_KEY"), false);

      const evaluation = await request(
        "answer",
        {
          interviewType: "technical",
          targetRole: "Frontend Developer",
          question: "How would you explain component state management?",
          answer: "State is data that changes the rendered component.",
        },
        studentToken
      );
      assert.equal(evaluation.status, 502);
      assert.match(evaluation.body.message, /invalid mock interview response/i);
    });
  } finally {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
    User.findById = originalUserFindById;
    AIAnalysis.findOne = originalAnalysisFindOne;
    geminiService.generateStructuredContent = originalGenerate;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
