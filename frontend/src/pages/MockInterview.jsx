import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "../jobs.css";

const MAX_ANSWER_LENGTH = 4000;
const roleOptions = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Software Developer",
  "Custom role",
];

function getErrorMessage(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check your connection and try again.";
  }
  return fallback;
}

function FeedbackList({ title, items }) {
  return (
    <article className="resume-result-card">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="resume-result-empty">No points to show.</p>
      )}
    </article>
  );
}

function summarizeEvaluations(evaluations) {
  const uniqueItems = (key) => {
    const seen = new Set();
    return evaluations
      .flatMap((evaluation) => evaluation[key])
      .filter((item) => {
        const normalized = item.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  };

  return {
    score: Math.round(
      evaluations.reduce((total, evaluation) => total + evaluation.score, 0) /
        evaluations.length
    ),
    strengths: uniqueItems("strengths"),
    weaknesses: uniqueItems("weaknesses"),
    improvementSuggestions: uniqueItems("improvementSuggestions"),
  };
}

function MockInterview() {
  const [searchParams] = useSearchParams();
  const [screen, setScreen] = useState("start");
  const [interviewType, setInterviewType] = useState(
    () => searchParams.get("type") === "hr" ? "hr" : "technical"
  );
  const [roleSelection, setRoleSelection] = useState(roleOptions[0]);
  const [customRole, setCustomRole] = useState("");
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState("");
  const [answersByQuestion, setAnswersByQuestion] = useState({});
  const [activeQuestionNumber, setActiveQuestionNumber] = useState(1);
  const [questionDifficulties, setQuestionDifficulties] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [previousQuestions, setPreviousQuestions] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const targetRole = roleSelection === "Custom role" ? customRole.trim() : roleSelection;
  const summary = useMemo(
    () => (evaluations.length ? summarizeEvaluations(evaluations) : null),
    [evaluations]
  );

  const startInterview = async (event) => {
    event.preventDefault();
    if (roleSelection === "Custom role" && (targetRole.length < 2 || targetRole.length > 80)) {
      setError("Enter a custom role between 2 and 80 characters.");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const { data } = await api.post("/ai/mock-interview/start", {
        interviewType,
        targetRole,
      });
      setSession(data.data);
      setEvaluations([]);
      setAnswer("");
      setAnswersByQuestion({});
      setActiveQuestionNumber(1);
      setQuestionDifficulties([data.data.question.difficulty]);
      setPreviousQuestions([data.data.question.question]);
      setScreen("interview");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We could not start your interview."));
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = async (event) => {
    event.preventDefault();
    if (
      !session ||
      activeQuestionNumber !== session.questionNumber ||
      !answer.trim()
    ) {
      setError("Write an answer before submitting.");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const { data } = await api.post("/ai/mock-interview/answer", {
        interviewType,
        targetRole,
        question: session.question.question,
        answer: answer.trim(),
      });
      setEvaluations((current) => [...current, data.data]);
      setAnswersByQuestion((current) => ({
        ...current,
        [activeQuestionNumber]: answer,
      }));
      setScreen("feedback");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We could not evaluate your answer."));
    } finally {
      setIsLoading(false);
    }
  };

  const continueInterview = async () => {
    if (!session) return;
    if (session.questionNumber >= session.totalQuestions) {
      setScreen("summary");
      return;
    }

    const nextNumber = session.questionNumber + 1;
    setError("");
    setIsLoading(true);
    try {
      const { data } = await api.post("/ai/mock-interview/next-question", {
        interviewType,
        targetRole,
        questionNumber: nextNumber,
        previousQuestions,
      });
      setSession((current) => ({ ...current, ...data.data }));
      setPreviousQuestions((current) => [...current, data.data.question.question]);
      setQuestionDifficulties((current) => [
        ...current,
        data.data.question.difficulty,
      ]);
      setActiveQuestionNumber(nextNumber);
      setAnswer("");
      setScreen("interview");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We could not generate the next question."));
    } finally {
      setIsLoading(false);
    }
  };

  const restartInterview = () => {
    setScreen("start");
    setSession(null);
    setAnswer("");
    setAnswersByQuestion({});
    setActiveQuestionNumber(1);
    setQuestionDifficulties([]);
    setEvaluations([]);
    setPreviousQuestions([]);
    setError("");
  };

  const selectQuestion = (questionNumber) => {
    setAnswersByQuestion((current) => ({
      ...current,
      [activeQuestionNumber]: answer,
    }));
    setActiveQuestionNumber(questionNumber);
    setAnswer(answersByQuestion[questionNumber] || "");
  };

  return (
    <>
      <Navbar />
      <main className="resume-analyzer-page">
        <header className="resume-analyzer-header">
          <span className="eyebrow">AI CAREER TOOL</span>
          <h1>AI Mock Interview</h1>
          <p>
            Practice one question at a time and get constructive feedback on
            your answers.
          </p>
        </header>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {screen === "start" && (
          <form className="resume-upload-card" onSubmit={startInterview}>
            <div className="upload-icon" aria-hidden="true">Q&amp;A</div>
            <h2>Set up your interview</h2>
            <label className="job-filter-panel">
              <span>Interview type</span>
              <select
                value={interviewType}
                onChange={(event) => setInterviewType(event.target.value)}
              >
                <option value="technical">Technical Interview</option>
                <option value="hr">HR Interview</option>
              </select>
            </label>
            <label className="job-filter-panel">
              <span>Target role</span>
              <select
                value={roleSelection}
                onChange={(event) => setRoleSelection(event.target.value)}
              >
                {roleOptions.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            {roleSelection === "Custom role" && (
              <label className="job-filter-panel">
                <span>Enter a role</span>
                <input
                  value={customRole}
                  onChange={(event) => setCustomRole(event.target.value)}
                  maxLength={80}
                  minLength={2}
                  required
                  placeholder="e.g. Data Analyst"
                />
              </label>
            )}
            <p className="resume-privacy-note">
              Your interview is not saved. Relevant skills from your existing
              resume analysis may be used to tailor questions.
            </p>
            <button className="btn btn-primary analyze-resume-button" disabled={isLoading}>
              {isLoading ? "Preparing your interview…" : "Start Interview"}
            </button>
          </form>
        )}

        {screen === "interview" && session && (
          <section className="resume-results" aria-labelledby="question-heading">
            <div className="mock-interview-layout">
              <nav className="mock-interview-question-nav" aria-label="Generated interview questions">
                {previousQuestions.map((question, index) => {
                  const questionNumber = index + 1;
                  return (
                    <button
                      key={`${question}-${questionNumber}`}
                      type="button"
                      className={questionNumber === activeQuestionNumber ? "is-active" : ""}
                      aria-current={questionNumber === activeQuestionNumber ? "step" : undefined}
                      aria-label={`Question ${questionNumber}`}
                      onClick={() => selectQuestion(questionNumber)}
                    >
                      {questionNumber}
                    </button>
                  );
                })}
              </nav>
              <div className="mock-interview-question-content">
                <div className="resume-results-heading">
                  <div>
                    <span className="eyebrow">
                      QUESTION {activeQuestionNumber} OF {session.totalQuestions}
                    </span>
                    <h2 id="question-heading">Your question</h2>
                  </div>
                  <p>
                    {interviewType === "technical" ? "Technical" : "HR"}{" "}
                    · {questionDifficulties[activeQuestionNumber - 1]}
                  </p>
                </div>
                <article className="resume-summary-card">
                  <h3>{previousQuestions[activeQuestionNumber - 1]}</h3>
                </article>
                <form className="resume-upload-card" onSubmit={submitAnswer}>
                  <label htmlFor="mock-interview-answer"><strong>Your answer</strong></label>
                  <textarea
                    className="mock-interview-answer"
                    id="mock-interview-answer"
                    value={answer}
                    onChange={(event) => {
                      setAnswer(event.target.value);
                      setAnswersByQuestion((current) => ({
                        ...current,
                        [activeQuestionNumber]: event.target.value,
                      }));
                    }}
                    maxLength={MAX_ANSWER_LENGTH}
                    rows={8}
                    required
                    readOnly={activeQuestionNumber !== session.questionNumber}
                    placeholder="Type your answer here…"
                  />
                  <p className="upload-info">
                    {answer.length}/{MAX_ANSWER_LENGTH} characters
                  </p>
                  <button
                    className="btn btn-primary analyze-resume-button"
                    disabled={
                      isLoading ||
                      !answer.trim() ||
                      activeQuestionNumber !== session.questionNumber
                    }
                  >
                    {isLoading ? "Evaluating your answer…" : "Submit Answer"}
                  </button>
                </form>
                <div className="mock-interview-question-controls">
                  <button
                    type="button"
                    className="mock-interview-question-control"
                    onClick={() => selectQuestion(activeQuestionNumber - 1)}
                    disabled={activeQuestionNumber === 1}
                  >
                    Previous
                  </button>
                  <span>
                    Question {activeQuestionNumber} of {previousQuestions.length}
                  </span>
                  <button
                    type="button"
                    className="mock-interview-question-control"
                    onClick={() => selectQuestion(activeQuestionNumber + 1)}
                    disabled={activeQuestionNumber === previousQuestions.length}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {screen === "feedback" && evaluations.length > 0 && (
          <section className="resume-results" aria-labelledby="feedback-heading">
            <div className="resume-results-heading">
              <div>
                <span className="eyebrow">
                  FEEDBACK FOR QUESTION {session.questionNumber}
                </span>
                <h2 id="feedback-heading">Your answer score: {evaluations.at(-1).score}/10</h2>
              </div>
            </div>
            <article className="resume-summary-card">
              <h3>Feedback</h3>
              <p>{evaluations.at(-1).feedback}</p>
            </article>
            <div className="resume-result-grid">
              <FeedbackList title="Strengths" items={evaluations.at(-1).strengths} />
              <FeedbackList title="Weaknesses" items={evaluations.at(-1).weaknesses} />
              <FeedbackList
                title="Improvement suggestions"
                items={evaluations.at(-1).improvementSuggestions}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary analyze-resume-button"
              onClick={continueInterview}
              disabled={isLoading}
            >
              {isLoading
                ? "Preparing…"
                : session.questionNumber >= session.totalQuestions
                  ? "View Interview Summary"
                  : "Next Question"}
            </button>
          </section>
        )}

        {screen === "summary" && summary && (
          <section className="resume-results" aria-labelledby="summary-heading">
            <div className="resume-results-heading">
              <div>
                <span className="eyebrow">INTERVIEW COMPLETE</span>
                <h2 id="summary-heading">Your Interview Summary</h2>
              </div>
            </div>
            <article className="resume-summary-card">
              <h3>Overall score: {summary.score}/10</h3>
              <p>Questions attempted: {evaluations.length}</p>
            </article>
            <div className="resume-result-grid">
              <FeedbackList title="Strengths" items={summary.strengths} />
              <FeedbackList title="Weaknesses" items={summary.weaknesses} />
              <FeedbackList
                title="Improvement suggestions"
                items={summary.improvementSuggestions}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary analyze-resume-button"
              onClick={restartInterview}
            >
              Restart Interview
            </button>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

export default MockInterview;
