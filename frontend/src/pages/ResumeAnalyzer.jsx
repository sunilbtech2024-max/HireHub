import { useEffect, useRef, useState } from "react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import JobCard from "../components/JobCard";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const analysisSections = [
  ["Technical skills", "technicalSkills"],
  ["Soft skills", "softSkills"],
  ["Education", "education"],
  ["Experience", "experience"],
  ["Projects", "projects"],
  ["Strengths", "strengths"],
  ["Areas to improve", "weaknesses"],
  ["Missing skills", "missingSkills"],
  ["Career suggestions", "careerSuggestions"],
  ["Improvement suggestions", "improvementSuggestions"],
];

const loadRecommendedJobs = async (setRecommendations, setError) => {
  try {
    const response = await api.get("/ai/jobs/recommended");
    setRecommendations(response.data.data);
  } catch (requestError) {
    setRecommendations([]);
    setError(apiErrorMessage(requestError, "Recommended jobs could not be loaded."));
  }
};

function ResumeAnalyzer() {
  const fileInput = useRef(null);
  const [resume, setResume] = useState(null);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const loadPage = async () => {
      try {
        const resumeResponse = await api.get("/resumes/mine");
        setResume(resumeResponse.data.data);
        try {
          const analysisResponse = await api.get("/ai/resume/analysis");
          setAnalysis(analysisResponse.data.data);
          await loadRecommendedJobs(setRecommendations, setRecommendationError);
        } catch (requestError) {
          if (requestError.response?.status !== 404) throw requestError;
        }
      } catch (requestError) {
        if (requestError.response?.status !== 404) {
          setError(apiErrorMessage(requestError, "Unable to load your resume."));
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadPage();
  }, []);

  const selectFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setError("");
    setStatus("");
    if (selected && (!selected.name.toLowerCase().endsWith(".pdf") || selected.type !== "application/pdf")) {
      setFile(null);
      setError("Choose a PDF file.");
    } else if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("The PDF is too large. Choose a file no larger than 5 MB.");
    } else {
      setFile(selected);
    }
  };

  const uploadResume = async () => {
    if (!file) return;
    setIsUploading(true);
    setError("");
    setStatus("");
    try {
      const body = new FormData();
      body.append("resume", file);
      const response = await api.post("/resumes", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResume(response.data.data);
      setAnalysis(null);
      setRecommendations([]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Resume uploaded successfully.");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "We could not upload your resume."));
    } finally {
      setIsUploading(false);
    }
  };

  const analyzeResume = async () => {
    setIsAnalyzing(true);
    setError("");
    setRecommendationError("");
    setStatus("");
    try {
      const response = await api.post("/ai/resume/analyze", {
        reanalyze: Boolean(analysis),
      });
      setAnalysis(response.data.data);
      setStatus(response.data.cached ? "Showing your latest resume analysis." : "Resume analysis is ready.");
      await loadRecommendedJobs(setRecommendations, setRecommendationError);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "We could not analyze your resume."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteResume = async () => {
    setIsUploading(true);
    setError("");
    setStatus("");
    try {
      await api.delete("/resumes/mine");
      setResume(null);
      setAnalysis(null);
      setRecommendations([]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Resume deleted.");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "We could not delete your resume."));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="resume-analyzer-page">
      <section className="resume-analyzer-header">
        <span className="eyebrow">AI CAREER TOOL</span>
        <h1>AI Resume <span>Analyzer</span></h1>
        <p>
          Understand your resume, highlight strengths, and get practical
          suggestions for your next career step.
        </p>
      </section>

      <section className="resume-upload-card" aria-labelledby="resume-upload-heading">
        <div className="upload-icon" aria-hidden="true">PDF</div>
        <h2 id="resume-upload-heading">{resume ? "Your resume" : "Upload your resume"}</h2>
        {isLoading ? (
          <p role="status">Loading your resume...</p>
        ) : resume ? (
          <>
            <p className="resume-current-file">{resume.originalName} · {(resume.size / 1024 / 1024).toFixed(2)} MB</p>
            <div className="resume-analyzer-actions">
              <button
                type="button"
                className="btn btn-primary analyze-resume-button"
                onClick={analyzeResume}
                disabled={isAnalyzing || isUploading}
              >
                {isAnalyzing ? "Analyzing your resume..." : analysis ? "Re-analyze Resume" : "Analyze Resume"}
              </button>
              <button type="button" className="btn btn-outline" onClick={deleteResume} disabled={isAnalyzing || isUploading}>
                Delete resume
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Upload your resume to get an AI-powered analysis.</p>
            <label htmlFor="resume-upload" className="upload-button">Choose PDF</label>
            <input
              ref={fileInput}
              type="file"
              id="resume-upload"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              onChange={selectFile}
              disabled={isUploading}
            />
            <span className="upload-info">
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF only · maximum file size 5 MB"}
            </span>
            {file && (
              <button type="button" className="btn btn-primary analyze-resume-button" onClick={uploadResume} disabled={isUploading}>
                {isUploading ? "Uploading resume..." : "Upload resume"}
              </button>
            )}
          </>
        )}
        <p className="resume-privacy-note">
          Your resume stays private. When you request an analysis, its extracted text is sent securely to Google Gemini for processing.
        </p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {status && <p className="profile-success" role="status">{status}</p>}
      </section>

      {analysis && (
        <section className="resume-results" aria-labelledby="analysis-heading">
          <div className="resume-results-heading">
            <div>
              <span className="eyebrow">PERSONALIZED INSIGHTS</span>
              <h2 id="analysis-heading">Resume analysis</h2>
            </div>
            <p>AI-generated guidance is informational and does not guarantee employment.</p>
          </div>
          <article className="resume-summary-card">
            <h3>Resume summary</h3>
            <p>{analysis.summary}</p>
            {analysis.skills?.length > 0 && (
              <div className="resume-result-skill-list">
                <h4>Skills</h4>
                <ul>{analysis.skills.map((skill, index) => <li key={`${skill}-${index}`}>{skill}</li>)}</ul>
              </div>
            )}
          </article>
          <div className="resume-result-grid">
            {analysisSections.map(([title, key]) => (
              <article className="resume-result-card" key={key}>
                <h3>{title}</h3>
                {analysis[key]?.length ? (
                  <ul>{analysis[key].map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul>
                ) : (
                  <p className="resume-result-empty">No {title.toLowerCase()} identified in the resume.</p>
                )}
              </article>
            ))}
          </div>

          <section className="recommended-jobs" aria-labelledby="recommended-heading">
            <div className="resume-results-heading">
              <div>
                <span className="eyebrow">EXPLAINABLE SKILL MATCHING</span>
                <h2 id="recommended-heading">Recommended jobs</h2>
              </div>
              <p>Match scores use skills, experience, and education where listed.</p>
            </div>
            {recommendationError && <p className="auth-error" role="alert">{recommendationError}</p>}
            {!recommendationError && recommendations.length === 0 ? (
              <p className="resume-no-jobs">No active jobs are available to match your resume right now.</p>
            ) : !recommendationError ? (
              <div className="job-results-list">
                {recommendations.map((job) => <JobCard key={job._id} job={job} />)}
              </div>
            ) : null}
          </section>
        </section>
      )}
      </main>
      <Footer />
    </>
  );
}

export default ResumeAnalyzer;
