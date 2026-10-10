import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function HowItWorks() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="how-it-works">

      <div className="section-heading">

        <span>HOW IT WORKS</span>

        <h2>
          Your Career Journey
          <br />
          <span>Starts Here</span>
        </h2>

        <p>
          Follow a simple process to discover opportunities
          and move closer to your career goals.
        </p>

      </div>


      <div className="steps-container">

        <Link className="step-card homepage-card-link" to={isAuthenticated ? "/account" : "/register"}>

          <div className="step-number">
            01
          </div>

          <h3>Create Your Profile</h3>

          <p>
            Add your education, skills and career
            preferences to build your HireHub profile.
          </p>

        </Link>

        <Link className="step-card homepage-card-link" to="/ai-tools/resume-analyzer">

          <div className="step-number">
            02
          </div>

          <h3>Upload Your Resume</h3>

          <p>
            Upload your resume and let AI analyze
            your skills, education and experience.
          </p>

        </Link>

        <Link className="step-card homepage-card-link" to="/ai-tools/job-matching">

          <div className="step-number">
            03
          </div>

          <h3>Get Smart Matches</h3>

          <p>
            Receive job and internship recommendations
            based on your profile and skills.
          </p>

        </Link>

        <Link className="step-card homepage-card-link" to="/applications">

          <div className="step-number">
            04
          </div>

          <h3>Apply & Track</h3>

          <p>
            Apply to opportunities and keep track of
            your applications in one place.
          </p>

        </Link>

      </div>

    </section>
  );
}

export default HowItWorks;