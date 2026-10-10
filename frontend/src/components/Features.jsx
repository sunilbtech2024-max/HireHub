import { Link } from "react-router-dom";

function Features() {
  return (
    <section className="features-section" id="ai">

      <div className="section-heading">

        <span>HIREHUB FEATURES</span>

        <h2>
          Everything You Need
          <br />
          <span>For Your Career</span>
        </h2>

        <p>
          From finding opportunities to improving your skills,
          HireHub helps you throughout your career journey.
        </p>

      </div>


      <div className="features-grid">

        <Link className="feature-card homepage-card-link" to="/ai-tools/resume-analyzer">

          <div className="feature-icon">📄</div>

          <h3>AI Resume Analyzer</h3>

          <p>
            Analyze your resume with AI and identify
            skills, strengths and areas for improvement.
          </p>

        </Link>

        <Link className="feature-card homepage-card-link" to="/ai-tools/job-matching">

          <div className="feature-icon">🎯</div>

          <h3>AI Job Matching</h3>

          <p>
            Get job and internship recommendations
            based on your skills and profile.
          </p>

        </Link>

        <Link className="feature-card homepage-card-link" to="/ai-tools/skill-gap">

          <div className="feature-icon">📊</div>

          <h3>Skill Gap Analysis</h3>

          <p>
            Discover the skills you are missing and
            understand what you need to learn next.
          </p>

        </Link>

        <Link className="feature-card homepage-card-link" to="/applications">

          <div className="feature-icon">📋</div>

          <h3>Application Tracking</h3>

          <p>
            Track your job and internship applications
            and keep your application journey organized.
          </p>

        </Link>

      </div>

    </section>
  );
}

export default Features;