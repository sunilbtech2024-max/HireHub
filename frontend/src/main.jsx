import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Register from "./pages/Register.jsx";
import Jobs from './pages/Jobs.jsx'
import Internships from './pages/Internships.jsx'
import JobDetails from './pages/JobDetails.jsx'
import MyApplications from './pages/MyApplications.jsx'
import ApplicationDetails from './pages/ApplicationDetails.jsx'
import CompanyApplicants from './pages/CompanyApplicants.jsx'
import AITools from './pages/AITools.jsx'
import ResumeAnalyzer from './pages/ResumeAnalyzer.jsx'
import JobMatching from './pages/JobMatching.jsx'
import SkillGapAnalysis from './pages/SkillGapAnalysis.jsx'
import MockInterview from './pages/MockInterview.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

import './index.css'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import Account from './pages/Account.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'
import CompanyDashboard from './pages/CompanyDashboard.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import Notifications from './pages/Notifications.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          <Route path="/" element={<App />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetails />} />
          <Route path="/internships" element={<Internships />} />
          <Route path="/ai-tools" element={<AITools />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute roles={["student"]} />}>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/ai-tools/resume-analyzer" element={<ResumeAnalyzer />} />
            <Route path="/ai-tools/job-matching" element={<JobMatching />} />
            <Route path="/ai-tools/skill-gap" element={<SkillGapAnalysis />} />
            <Route path="/ai-tools/mock-interview" element={<MockInterview />} />
            <Route path="/applications" element={<MyApplications />} />
            <Route path="/applications/:id" element={<ApplicationDetails />} />
          </Route>
          <Route element={<ProtectedRoute roles={["company", "admin"]} />}>
            <Route element={<ProtectedRoute roles={["company"]} />}>
              <Route path="/company/dashboard" element={<CompanyDashboard />} />
            </Route>
            <Route path="/company/jobs/:jobId/applications" element={<CompanyApplicants />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<Account />} />
            <Route path="/notifications" element={<Notifications />} />
          </Route>

        </Routes>
      </AuthProvider>
      
    </BrowserRouter>
  </StrictMode>,
)