import { Link } from "react-router-dom";

function AITools() {
  return (
    <main className="ai-tools-page">
      <section className="ai-tools-hero">
        <span className="eyebrow">AI POWERED CAREER TOOLS</span>

        <h1>
          Smarter Tools for
          <br />
          <span>Your Career Growth</span>
        </h1>

        <p>
          Use AI-powered tools to improve your resume, discover relevant
          opportunities, identify skill gaps, and prepare for interviews.
        </p>
      </section>

      <section className="ai-tools-grid">
        <div className="ai-tool-card">
          <div className="ai-tool-icon">📄</div>

          <h2>AI Resume Analyzer</h2>

          <p>
            Analyze your resume, identify strengths, and get suggestions
            to improve your profile.
          </p>

          <Link
             to="/ai-tools/resume-analyzer"
             className="btn btn-primary"
             >
            Analyze Resume →
          </Link>
        </div>

        <div className="ai-tool-card">
          <div className="ai-tool-icon">🎯</div>

          <h2>AI Job Matching</h2>

          <p>
            Find opportunities that match your skills, experience, and
            career interests.
          </p>

          <Link to="/ai-tools/job-matching" className="btn btn-primary">
            Find Matches →
          </Link>
        </div>

        <div className="ai-tool-card">
          <div className="ai-tool-icon">📊</div>

          <h2>Skill Gap Analysis</h2>

          <p>
            Discover missing skills and understand what you should learn
            for your target career.
          </p>

          <Link to="/ai-tools/skill-gap" className="btn btn-primary">
            Check Skill Gap →
          </Link>
        </div>

        <div className="ai-tool-card">
          <div className="ai-tool-icon">🤖</div>

          <h2>AI Mock Interview</h2>

          <p>
            Practice interview questions with AI and improve your
            interview preparation.
          </p>

          <Link to="/ai-tools/mock-interview" className="btn btn-primary">
            Start Interview →
          </Link>
        </div>
      </section>
    </main>
  );
}

export default AITools;