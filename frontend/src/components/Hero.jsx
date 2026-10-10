import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="hero" id="home">

      <div className="hero-copy">

        <span className="eyebrow">
          Your Career Acceleration Platform
        </span>

        <h1>
          Build Your Dream Career
          <br />
          <span>With HireHub</span>
        </h1>

        <p>
          Discover jobs and internships, improve your resume,
          practice interviews with AI, and prepare yourself
          for your next career opportunity.
        </p>

        <div className="hero-buttons">

          <Link
            to="/register"
            className="btn btn-primary"
          >
            Get Started →
          </Link>

          <Link
            to="/jobs"
            className="btn btn-light"
          >
            Explore Opportunities
          </Link>

        </div>

      </div>


      <div className="hero-visual">

        <Link className="service-card homepage-card-link" to="/ai-tools/mock-interview">

          <div className="service-icon ai-icon">
            🤖
          </div>

          <div>
            <h3>AI Mock Interview</h3>
            <p>Practice with AI</p>
          </div>

        </Link>

        <Link className="service-card homepage-card-link" to="/ai-tools/mock-interview?type=hr">

          <div className="service-icon hr-icon">
            👨‍💼
          </div>

          <div>
            <h3>HR Mock Interview</h3>
            <p>Prepare for interviews</p>
          </div>

        </Link>

        <Link className="service-card homepage-card-link" to="/ai-tools/resume-analyzer">

          <div className="service-icon resume-icon">
            📄
          </div>

          <div>
            <h3>Resume ATS</h3>
            <p>Improve your resume</p>
          </div>

        </Link>

        <Link className="service-card homepage-card-link" to="/jobs">

          <div className="service-icon jobs-icon">
            💼
          </div>

          <div>
            <h3>Jobs & Internships</h3>
            <p>Find opportunities</p>
          </div>

        </Link>

      </div>

    </section>
  );
}

export default Hero;