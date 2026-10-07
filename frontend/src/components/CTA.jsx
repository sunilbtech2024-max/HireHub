function CTA() {
  return (
    <section className="cta-section">

      <div className="cta-content">

        <span>START YOUR JOURNEY</span>

        <h2>
          Ready to Build Your
          <br />
          Dream Career?
        </h2>

        <p>
          Discover opportunities, improve your skills
          and take the next step with HireHub.
        </p>

        <button
          className="btn btn-primary"
          onClick={() => window.location.href = "/login"}
        >
          Get Started →
        </button>

      </div>

    </section>
  );
}

export default CTA;