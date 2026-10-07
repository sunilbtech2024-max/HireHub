import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import CompanyProfile from "../components/CompanyProfile";
import MyJobs from "../components/MyJobs";
import ResumeAccountSection from "../components/ResumeAccountSection";

const roleLabels = {
  student: "Student / Job Seeker",
  company: "Company / Recruiter",
  admin: "Administrator",
};

const emptyEducation = () => ({
  degree: "",
  fieldOfStudy: "",
  institution: "",
  startYear: "",
  endYear: "",
  grade: "",
});

const emptyExperience = () => ({
  title: "",
  company: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
});

const hasValues = (entry) =>
  Object.entries(entry).some(([key, value]) => key !== "current" && value);

function Account() {
  const { user, company, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    name: user.name || "",
    phone: user.phone || "",
    headline: user.headline || "",
    bio: user.bio || "",
    location: user.location || "",
    skills: (user.skills || []).join(", "),
    education: user.education?.length ? user.education : [emptyEducation()],
    experience: user.experience?.length ? user.experience : [emptyExperience()],
  }));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const updateEntry = (section, index, field, value) => {
    setForm((current) => ({
      ...current,
      [section]: current[section].map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      ),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      await updateProfile({
        name: form.name,
        phone: form.phone,
        headline: form.headline,
        bio: form.bio,
        location: form.location,
        skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
        education: form.education
          .filter(hasValues)
          .map(({ degree, fieldOfStudy, institution, startYear, endYear, grade }) => ({
            degree,
            fieldOfStudy,
            institution,
            startYear,
            endYear,
            grade,
          })),
        experience: form.experience
          .filter(hasValues)
          .map(({ title, company: organization, location, startDate, endDate, current, description }) => ({
            title,
            company: organization,
            location,
            startDate,
            endDate,
            current,
            description,
          })),
      });
      setSuccess("Your profile has been saved.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          (requestError.request
            ? "Unable to reach HireHub. Check that the backend is running and try again."
            : "We could not save your profile. Please try again.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="profile-page">
      <section className="profile-heading">
        <div>
          <p className="eyebrow">Your HireHub account</p>
          <h1>Profile</h1>
          <p>Keep your details current so opportunities can better match your experience.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={handleLogout}>
          Log out
        </button>
      </section>

      <section className="profile-card" aria-labelledby="identity-heading">
        <div className="profile-identity">
          <div className="profile-avatar" aria-hidden="true">
            {user.name?.trim().charAt(0).toUpperCase() || "H"}
          </div>
          <div>
            <h2 id="identity-heading">{user.name}</h2>
            <p>{user.email} · {roleLabels[user.role] || user.role}</p>
            {company && <p>{company.companyName} · Verification {company.verificationStatus}</p>}
          </div>
        </div>
      </section>

      {user.role === "student" ? (
        <form className="profile-form" onSubmit={handleSubmit}>
          <ResumeAccountSection />
          <section className="profile-card">
            <div className="profile-section-heading">
              <h2>Personal information</h2>
              <p>Share the details you want employers to see.</p>
            </div>
            <div className="profile-fields">
              <label className="profile-field">
                Full name
                <input name="name" value={form.name} onChange={handleChange} maxLength={100} required />
              </label>
              <label className="profile-field">
                Email
                <input value={user.email} readOnly />
              </label>
              <label className="profile-field">
                Phone
                <input name="phone" value={form.phone} onChange={handleChange} maxLength={30} />
              </label>
              <label className="profile-field">
                Location
                <input name="location" value={form.location} onChange={handleChange} maxLength={120} placeholder="City, country" />
              </label>
              <label className="profile-field profile-field-wide">
                Professional headline
                <input name="headline" value={form.headline} onChange={handleChange} maxLength={160} placeholder="e.g. Computer science student focused on frontend development" />
              </label>
              <label className="profile-field profile-field-wide">
                About
                <textarea name="bio" value={form.bio} onChange={handleChange} maxLength={1000} rows={4} />
                <span className="profile-hint">{form.bio.length}/1000 characters</span>
              </label>
              <label className="profile-field profile-field-wide">
                Skills
                <input name="skills" value={form.skills} onChange={handleChange} maxLength={3050} placeholder="React, JavaScript, MongoDB" />
                <span className="profile-hint">Separate skills with commas.</span>
              </label>
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-section-heading">
              <h2>Education</h2>
              <p>Add your education history.</p>
            </div>
            <div className="profile-entry-list">
              {form.education.map((education, index) => (
                <fieldset className="profile-entry" key={`education-${index}`}>
                  <legend>Education {index + 1}</legend>
                  <div className="profile-fields">
                    <label className="profile-field">
                      Degree
                      <input value={education.degree || ""} onChange={(event) => updateEntry("education", index, "degree", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field">
                      Field of study
                      <input value={education.fieldOfStudy || ""} onChange={(event) => updateEntry("education", index, "fieldOfStudy", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field profile-field-wide">
                      Institution
                      <input value={education.institution || ""} onChange={(event) => updateEntry("education", index, "institution", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field">
                      Start year
                      <input value={education.startYear || ""} onChange={(event) => updateEntry("education", index, "startYear", event.target.value)} maxLength={20} />
                    </label>
                    <label className="profile-field">
                      End year
                      <input value={education.endYear || ""} onChange={(event) => updateEntry("education", index, "endYear", event.target.value)} maxLength={20} placeholder="or expected year" />
                    </label>
                    <label className="profile-field profile-field-wide">
                      Grade
                      <input value={education.grade || ""} onChange={(event) => updateEntry("education", index, "grade", event.target.value)} maxLength={100} />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="profile-remove-button"
                    onClick={() => setForm((current) => ({
                      ...current,
                      education: current.education.length === 1
                        ? [emptyEducation()]
                        : current.education.filter((_, entryIndex) => entryIndex !== index),
                    }))}
                  >
                    Remove education
                  </button>
                </fieldset>
              ))}
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setForm((current) => ({ ...current, education: [...current.education, emptyEducation()] }))}>
              Add education
            </button>
          </section>

          <section className="profile-card">
            <div className="profile-section-heading">
              <h2>Experience</h2>
              <p>Include work, internships, volunteering, or relevant projects.</p>
            </div>
            <div className="profile-entry-list">
              {form.experience.map((experience, index) => (
                <fieldset className="profile-entry" key={`experience-${index}`}>
                  <legend>Experience {index + 1}</legend>
                  <div className="profile-fields">
                    <label className="profile-field">
                      Role
                      <input value={experience.title || ""} onChange={(event) => updateEntry("experience", index, "title", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field">
                      Organization
                      <input value={experience.company || ""} onChange={(event) => updateEntry("experience", index, "company", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field">
                      Location
                      <input value={experience.location || ""} onChange={(event) => updateEntry("experience", index, "location", event.target.value)} maxLength={200} />
                    </label>
                    <label className="profile-field">
                      Start date
                      <input value={experience.startDate || ""} onChange={(event) => updateEntry("experience", index, "startDate", event.target.value)} maxLength={40} />
                    </label>
                    <label className="profile-field">
                      End date
                      <input value={experience.endDate || ""} onChange={(event) => updateEntry("experience", index, "endDate", event.target.value)} maxLength={40} disabled={experience.current} />
                    </label>
                    <label className="profile-checkbox">
                      <input type="checkbox" checked={Boolean(experience.current)} onChange={(event) => updateEntry("experience", index, "current", event.target.checked)} />
                      I currently work here
                    </label>
                    <label className="profile-field profile-field-wide">
                      Description
                      <textarea value={experience.description || ""} onChange={(event) => updateEntry("experience", index, "description", event.target.value)} maxLength={2000} rows={3} />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="profile-remove-button"
                    onClick={() => setForm((current) => ({
                      ...current,
                      experience: current.experience.length === 1
                        ? [emptyExperience()]
                        : current.experience.filter((_, entryIndex) => entryIndex !== index),
                    }))}
                  >
                    Remove experience
                  </button>
                </fieldset>
              ))}
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setForm((current) => ({ ...current, experience: [...current.experience, emptyExperience()] }))}>
              Add experience
            </button>
          </section>

          {error && <p className="auth-error" role="alert">{error}</p>}
          {success && <p className="profile-success" role="status">{success}</p>}
          <button type="submit" className="btn btn-primary profile-save" disabled={isSaving}>
            {isSaving ? "Saving profile..." : "Save profile"}
          </button>
        </form>
      ) : user.role === "company" && company ? (
        <>
          <CompanyProfile />
          <MyJobs />
        </>
      ) : (
        <section className="profile-card">
          <div className="profile-section-heading">
            <h2>Account details</h2>
            <p>Company and administrator workspace features are part of their respective roadmap phases.</p>
          </div>
          <dl className="account-details">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Account type</dt><dd>{roleLabels[user.role] || user.role}</dd></div>
            {company && <div><dt>Company</dt><dd>{company.companyName} · Verification {company.verificationStatus}</dd></div>}
          </dl>
        </section>
      )}
      </main>
      <Footer />
    </>
  );
}

export default Account;
