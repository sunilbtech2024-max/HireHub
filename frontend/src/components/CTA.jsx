import { Link } from "react-router-dom";

function CTA() {
  return (
    <section className="cta-section">

      <div className="cta-content">

        <Link to="/register" className="homepage-card-link">
          <span>START YOUR JOURNEY</span>
        </Link>

        <h2>
          Ready to Build Your
          <br />
          Dream Career?
        </h2>

        <p>
          Discover opportunities, improve your skills
          and take the next step with HireHub.
        </p>

        <Link
          to="/register"
          className="btn btn-primary"
        >
          Get Started →
        </Link>

      </div>

    </section>
  );
}

export default CTA;