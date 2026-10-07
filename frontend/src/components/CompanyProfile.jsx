import { useState } from "react";
import { useAuth } from "../context/useAuth";

const companySizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

function getErrorMessage(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) {
    return "Unable to reach HireHub. Check that the backend is running and try again.";
  }
  return fallback;
}

function CompanyProfile() {
  const { company, updateCompanyProfile, requestCompanyVerification } = useAuth();
  const [form, setForm] = useState(() => ({
    companyName: company.companyName || "",
    description: company.description || "",
    website: company.website || "",
    industry: company.industry || "",
    location: company.location || "",
    companySize: company.companySize || "1-10",
  }));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);
    try {
      await updateCompanyProfile(form);
      setSuccess("Company profile saved.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We could not save the company profile."));
    } finally {
      setIsSaving(false);
    }
  };

  const submitVerification = async () => {
    setError("");
    setSuccess("");
    setIsRequesting(true);
    try {
      const result = await requestCompanyVerification();
      setSuccess(result.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We could not submit the verification request."));
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <>
      <form className="profile-form" onSubmit={saveProfile}>
        <section className="profile-card">
          <div className="profile-section-heading">
            <h2>Company information</h2>
            <p>Complete your organization profile so candidates and reviewers know who you are.</p>
          </div>
          <div className="profile-fields">
            <label className="profile-field">
              Company name
              <input name="companyName" value={form.companyName} onChange={handleChange} maxLength={160} required />
            </label>
            <label className="profile-field">
              Industry
              <input name="industry" value={form.industry} onChange={handleChange} maxLength={120} placeholder="e.g. Financial technology" />
            </label>
            <label className="profile-field">
              Website
              <input name="website" type="url" value={form.website} onChange={handleChange} maxLength={300} placeholder="https://example.com" />
            </label>
            <label className="profile-field">
              Location
              <input name="location" value={form.location} onChange={handleChange} maxLength={160} placeholder="City, country" />
            </label>
            <label className="profile-field">
              Company size
              <select name="companySize" value={form.companySize} onChange={handleChange}>
                {companySizes.map((size) => <option key={size} value={size}>{size} employees</option>)}
              </select>
            </label>
            <label className="profile-field profile-field-wide">
              About the company
              <textarea name="description" value={form.description} onChange={handleChange} maxLength={2000} rows={5} />
              <span className="profile-hint">{form.description.length}/2000 characters</span>
            </label>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {success && <p className="profile-success" role="status">{success}</p>}
          <button type="submit" className="btn btn-primary profile-save" disabled={isSaving}>
            {isSaving ? "Saving profile..." : "Save company profile"}
          </button>
        </section>
      </form>

      <section className="profile-card company-verification-card">
        <div className="profile-section-heading">
          <h2>Company verification</h2>
          <p>
            Verification requests are reviewed by an administrator. A pending request does not mean the company is verified.
          </p>
        </div>
        <p className={`verification-status verification-${company.verificationStatus}`}>
          Status: {company.verificationStatus}
        </p>
        {company.verificationRequestedAt && (
          <p className="profile-hint">
            Request submitted {new Date(company.verificationRequestedAt).toLocaleDateString()}.
          </p>
        )}
        {!company.verified && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={submitVerification}
            disabled={isRequesting}
          >
            {isRequesting ? "Submitting request..." : company.verificationRequestedAt ? "Resubmit for review" : "Request verification"}
          </button>
        )}
      </section>
    </>
  );
}

export default CompanyProfile;
