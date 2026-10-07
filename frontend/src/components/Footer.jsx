import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="footer">

      <div className="footer-container">

        <div className="footer-brand">

          <div className="brand-wrap">

            <div className="brand-mark">
              H
            </div>

            <span>
              HireHub
            </span>

          </div>

          <p>
            Your Career Acceleration Platform.
            Discover opportunities, build skills and
            grow your career with HireHub.
          </p>

        </div>


        <div className="footer-links">

          <h3>Platform</h3>

          <Link to="/">Home</Link>
          <Link to="/jobs">Jobs</Link>
          <Link to="/internships">Internships</Link>
          <Link to="/ai-tools">AI Tools</Link>

        </div>


        <div className="footer-links">

          <h3>Career</h3>

          <Link to="/jobs">Find Jobs</Link>
          <Link to="/internships">Find Internships</Link>
          <Link to="/ai-tools/resume-analyzer">Resume Analyzer</Link>
          <Link to="/ai-tools">AI Tools</Link>

        </div>


        <div className="footer-links">

          <h3>Company</h3>

          <p>About, Contact, Privacy Policy, and Terms pages are not available yet.</p>

        </div>

      </div>


      <div className="footer-bottom">

        <p>
          © 2026 HireHub. All rights reserved.
        </p>

        <p>
          Built for the next generation of talent.
        </p>

      </div>

    </footer>
  );
}

export default Footer;