import { useState } from "react";
import api from "../services/api";

const coverLetterLimit = 5000;

function getErrorMessage(error) {
  if (error.response?.status === 409) {
    return error.response.data.message || "You have already applied to this opportunity.";
  }
  if (error.response?.status === 422 || error.response?.status === 400) {
    return error.response.data.message || "Check the application details and try again.";
  }
  if (error.response?.status === 401) return "Please sign in again to submit your application.";
  if (error.response?.status === 403) return "Your account is not permitted to submit applications.";
  if (error.response?.status === 404) return "This opportunity is no longer available.";
  if (error.response?.status >= 500) return "HireHub could not submit your application. Please try again.";
  if (error.request) return "Unable to reach HireHub. Check your connection and try again.";
  return "We could not submit your application. Please try again.";
}

function ApplyForm({ job, onApplied, onCancel }) {
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeFileUrl, setResumeFileUrl] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (coverLetter.length > coverLetterLimit) {
      setError(`Cover letter cannot exceed ${coverLetterLimit} characters.`);
      return;
    }
    if (Boolean(resumeFileName.trim()) !== Boolean(resumeFileUrl.trim())) {
      setError("Enter both the resume file name and its secure link, or leave both blank.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = { jobId: job._id, coverLetter: coverLetter.trim() };
      if (resumeFileUrl.trim()) {
        payload.resume = {
          fileName: resumeFileName.trim(),
          fileUrl: resumeFileUrl.trim(),
        };
      }
      const { data } = await api.post("/applications", payload);
      onApplied(data.data, data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <div className="application-form-heading">
        <h2>Apply for {job.title}</h2>
        <p>{job.companyId?.companyName || "Company"}</p>
      </div>

      <fieldset className="application-resume-fields">
        <legend>Resume <span>(optional)</span></legend>
        <p className="application-form-hint">
          If you uploaded a PDF under Profile → Resume, it remains saved to your account. It is not attached to this application automatically. To share a resume with this employer, add its secure HTTPS link below; you do not need to upload another copy.
        </p>
        <label>
          Resume file name
          <input
            value={resumeFileName}
            onChange={(event) => setResumeFileName(event.target.value)}
            maxLength={255}
            placeholder="e.g. Alex-Taylor-Resume.pdf"
          />
        </label>
        <label>
          HTTPS resume link
          <input
            type="url"
            value={resumeFileUrl}
            onChange={(event) => setResumeFileUrl(event.target.value)}
            maxLength={2048}
            placeholder="https://..."
          />
        </label>
      </fieldset>

      <label className="application-cover-letter">
        Cover letter <span>(optional)</span>
        <textarea
          value={coverLetter}
          onChange={(event) => setCoverLetter(event.target.value)}
          maxLength={coverLetterLimit}
          rows={6}
          placeholder="Introduce yourself and explain why you are interested in this opportunity."
        />
        <span className="application-form-hint">{coverLetter.length}/{coverLetterLimit}</span>
      </label>

      {error && <p className="application-error" role="alert">{error}</p>}
      <div className="application-form-actions">
        <button type="button" className="application-secondary-button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="application-primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}

export default ApplyForm;
