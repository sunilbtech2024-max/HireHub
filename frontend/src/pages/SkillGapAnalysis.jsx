import { useEffect, useState } from "react";
import api from "../services/api";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "../jobs.css";

const priorityLabels = [
  ["high", "High priority"],
  ["medium", "Medium priority"],
  ["low", "Lower priority"],
];

function getErrorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check your connection and try again.";
  }
  return "We could not load your skill gap analysis. Please try again.";
}

function SkillList({ skills, emptyMessage }) {
  if (!skills.length) {
    return <p className="resume-result-empty">{emptyMessage}</p>;
  }

  return (
    <ul>
      {skills.map((item) => {
        const skill = typeof item === "string" ? item : item.skill;
        const jobCount = typeof item === "string" ? null : item.jobCount;
        return (
          <li key={skill}>
            {skill}
            {jobCount !== null && (
              <span> — listed by {jobCount} active {jobCount === 1 ? "job" : "jobs"}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SkillGapAnalysis() {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadSkillGap = async () => {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/ai/skill-gap", {
          signal: controller.signal,
        });
        if (!data.data || !Array.isArray(data.data.yourSkills)) {
          throw new Error("HireHub returned an invalid skill gap response.");
        }
        setAnalysis(data.data);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED") {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadSkillGap();
    return () => controller.abort();
  }, [refreshCount]);

  const hasJobData = analysis?.jobsAnalyzed > 0;

  return (
    <>
      <Navbar />
      <main className="resume-analyzer-page">
        <header className="resume-analyzer-header">
          <span className="eyebrow">AI CAREER TOOL</span>
          <h1>Skill Gap Analysis</h1>
          <p>
            Discover the skills you already have and the skills you should
            learn for your target career.
          </p>
        </header>

        {isLoading && (
          <p className="job-board-message" role="status">
            Comparing your analyzed skills with active job requirements…
          </p>
        )}

        {!isLoading && error && (
          <div className="job-board-message job-board-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="job-retry-button"
              onClick={() => setRefreshCount((count) => count + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && analysis && !hasJobData && (
          <section className="resume-no-jobs" aria-live="polite">
            <h2>No active job requirements to compare yet</h2>
            <p>
              Your analyzed skills are available, but there are no active
              HireHub jobs with structured skill requirements right now.
            </p>
          </section>
        )}

        {!isLoading && !error && analysis && hasJobData && (
          <section className="resume-results">
            <div className="resume-results-heading">
              <div>
                <span className="eyebrow">BASED ON YOUR EXISTING ANALYSIS</span>
                <h2>Your Skills</h2>
              </div>
              <p>
                Compared with {analysis.jobsAnalyzed} active HireHub{" "}
                {analysis.jobsAnalyzed === 1 ? "job" : "jobs"} that list
                required skills. No new resume analysis was run.
              </p>
            </div>

            <div className="resume-result-grid">
              <article className="resume-result-card">
                <h3>Technical skills</h3>
                <SkillList
                  skills={analysis.technicalSkills}
                  emptyMessage="No technical skills were identified in your resume analysis."
                />
              </article>
              <article className="resume-result-card">
                <h3>Soft skills</h3>
                <SkillList
                  skills={analysis.softSkills}
                  emptyMessage="No soft skills were identified in your resume analysis."
                />
              </article>
              {analysis.otherSkills.length > 0 && (
                <article className="resume-result-card">
                  <h3>Additional skills</h3>
                  <SkillList
                    skills={analysis.otherSkills}
                    emptyMessage="No additional skills were identified."
                  />
                </article>
              )}
            </div>

            <section className="recommended-jobs">
              <div className="resume-results-heading">
                <div>
                  <span className="eyebrow">SKILLS FOUND IN JOB REQUIREMENTS</span>
                  <h2>Skills You Have</h2>
                </div>
              </div>
              <article className="resume-result-card">
                <SkillList
                  skills={analysis.matchedSkills}
                  emptyMessage="None of your analyzed skills match the required skills in these active listings yet."
                />
              </article>
            </section>

            <section className="recommended-jobs">
              <div className="resume-results-heading">
                <div>
                  <span className="eyebrow">BASED ON ACTIVE HIREHUB JOBS</span>
                  <h2>Skill Gaps</h2>
                </div>
                <p>
                  A gap is a required job skill not found in your existing
                  resume analysis.
                </p>
              </div>
              <article className="resume-result-card">
                <SkillList
                  skills={analysis.skillGaps}
                  emptyMessage="No skill gaps found in the active job requirements we analyzed."
                />
              </article>
            </section>

            <section className="recommended-jobs">
              <div className="resume-results-heading">
                <div>
                  <span className="eyebrow">PRACTICAL LEARNING FOCUS</span>
                  <h2>Recommended Skills to Learn</h2>
                </div>
              </div>
              <article className="resume-result-card">
                <SkillList
                  skills={analysis.recommendedSkills}
                  emptyMessage="There are no job-based skill recommendations right now."
                />
              </article>
            </section>

            <section className="recommended-jobs">
              <div className="resume-results-heading">
                <div>
                  <span className="eyebrow">PRIORITY BY JOB FREQUENCY</span>
                  <h2>Learning Priority</h2>
                </div>
                <p>
                  High means required by at least half of analyzed jobs;
                  medium by at least one fifth; lower priority appears less
                  often.
                </p>
              </div>
              <div className="resume-result-grid">
                {priorityLabels.map(([key, label]) => (
                  <article className="resume-result-card" key={key}>
                    <h3>{label}</h3>
                    <SkillList
                      skills={analysis.learningPriority[key]}
                      emptyMessage="No skills in this priority group."
                    />
                  </article>
                ))}
              </div>
            </section>

            <section className="recommended-jobs">
              <div className="resume-results-heading">
                <div>
                  <span className="eyebrow">NEXT STEPS</span>
                  <h2>Recommended next steps</h2>
                </div>
              </div>
              <article className="resume-result-card">
                <SkillList
                  skills={analysis.nextSteps}
                  emptyMessage="Review active job listings again when requirements are available."
                />
              </article>
            </section>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

export default SkillGapAnalysis;
