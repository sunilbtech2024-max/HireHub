function Opportunities() {
  return (
    <section className="opportunities-section" id="jobs">

      <div className="section-heading">

        <span>OPPORTUNITIES</span>

        <h2>
          Find Your Next
          <br />
          <span>Career Opportunity</span>
        </h2>

        <p>
          Discover jobs and internships that match
          your skills, interests and career goals.
        </p>

      </div>


      <div className="opportunity-grid">

        <div className="opportunity-card">

          <div className="opportunity-top">

            <div className="company-logo">
              T
            </div>

            <span className="opportunity-type">
              Full Time
            </span>

          </div>

          <h3>Software Developer</h3>

          <p className="company-name">
            Tech Company
          </p>

          <p className="job-location">
            📍 Bangalore · Remote
          </p>

          <div className="job-tags">
            <span>React</span>
            <span>Node.js</span>
            <span>MongoDB</span>
          </div>

          <button className="apply-button">
            View Opportunity →
          </button>

        </div>


        <div className="opportunity-card">

          <div className="opportunity-top">

            <div className="company-logo">
              A
            </div>

            <span className="opportunity-type">
              Internship
            </span>

          </div>

          <h3>Frontend Developer Intern</h3>

          <p className="company-name">
            ABC Technologies
          </p>

          <p className="job-location">
            📍 Delhi · Hybrid
          </p>

          <div className="job-tags">
            <span>React</span>
            <span>JavaScript</span>
            <span>CSS</span>
          </div>

          <button className="apply-button">
            View Opportunity →
          </button>

        </div>

      </div>

    </section>
  );
}

export default Opportunities;