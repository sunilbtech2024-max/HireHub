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

          <button
            className="btn btn-primary"
            onClick={() => window.location.href = "/login"}
          >
            Get Started →
          </button>

          <button
            className="btn btn-light"
            onClick={() => {
              document.getElementById("jobs")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            Explore Opportunities
          </button>

        </div>

      </div>


      <div className="hero-visual">

        <div className="service-card">

          <div className="service-icon ai-icon">
            🤖
          </div>

          <div>
            <h3>AI Mock Interview</h3>
            <p>Practice with AI</p>
          </div>

        </div>


        <div className="service-card">

          <div className="service-icon hr-icon">
            👨‍💼
          </div>

          <div>
            <h3>HR Mock Interview</h3>
            <p>Prepare for interviews</p>
          </div>

        </div>


        <div className="service-card">

          <div className="service-icon resume-icon">
            📄
          </div>

          <div>
            <h3>Resume ATS</h3>
            <p>Improve your resume</p>
          </div>

        </div>


        <div className="service-card">

          <div className="service-icon jobs-icon">
            💼
          </div>

          <div>
            <h3>Jobs & Internships</h3>
            <p>Find opportunities</p>
          </div>

        </div>

      </div>

    </section>
  );
}

export default Hero;