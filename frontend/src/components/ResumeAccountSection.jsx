import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function ResumeAccountSection() {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [resume, setResume] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadResume = async () => {
    try {
      const response = await api.get("/resumes/mine");
      setResume(response.data.data);
    } catch (requestError) {
      if (requestError.response?.status === 404) {
        setResume(null);
      } else {
        setError(apiErrorMessage(requestError, "Unable to load your resume."));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadResume);
  }, []);

  const chooseFile = (event) => {
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

  const upload = async () => {
    if (!file) return;
    setIsSaving(true);
    setError("");
    setStatus("");
    try {
      const body = new FormData();
      body.append("resume", file);
      const response = await api.post("/resumes", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResume(response.data.data);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Resume uploaded successfully.");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "We could not upload your resume."));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setIsSaving(true);
    setError("");
    setStatus("");
    try {
      await api.delete("/resumes/mine");
      setResume(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Resume deleted.");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "We could not delete your resume."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="profile-card resume-account-section" aria-labelledby="resume-account-heading">
      <div className="profile-section-heading">
        <h2 id="resume-account-heading">Resume</h2>
        <p>Your resume is private and is only analyzed after you request it. AI analysis sends extracted resume text to Google Gemini.</p>
      </div>
      {isLoading ? (
        <p role="status">Loading resume details...</p>
      ) : (
        <>
          <p className="resume-account-current">
            {resume
              ? `${resume.originalName} · ${(resume.size / 1024 / 1024).toFixed(2)} MB`
              : "No resume uploaded yet."}
          </p>
          <div className="resume-account-actions">
            <label className="btn btn-outline resume-file-label" htmlFor="account-resume-upload">
              {resume ? "Choose replacement PDF" : "Choose PDF"}
            </label>
            <input
              ref={fileInput}
              id="account-resume-upload"
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              onChange={chooseFile}
              disabled={isSaving}
            />
            {file && (
              <>
                <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button type="button" className="btn btn-primary" onClick={upload} disabled={isSaving}>
                  {isSaving ? "Uploading..." : "Upload resume"}
                </button>
              </>
            )}
            {resume && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => navigate("/ai-tools/resume-analyzer")}>
                  {status.includes("uploaded") ? "Analyze resume" : "Analyze / view analysis"}
                </button>
                <button type="button" className="profile-remove-button" onClick={remove} disabled={isSaving}>
                  Delete resume
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {status && <p className="profile-success" role="status">{status}</p>}
    </section>
  );
}

export default ResumeAccountSection;
