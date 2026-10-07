import { useState } from 'react';
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import NotificationBell from "./NotificationBell";

const activeLinkClassName = ({ isActive }) => isActive ? "is-active" : undefined;

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/");
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand-wrap" aria-label="HireHub home">
        <div className="brand-mark" aria-hidden="true">H</div>

        <div>
          <div className="brand-name">HireHub</div>
          <div className="brand-tagline">Career Acceleration Platform</div>
        </div>
      </Link>

      <nav className="main-nav" aria-label="Main navigation">
        <NavLink to="/" end className={activeLinkClassName}>
          Home
        </NavLink>

        <NavLink to="/jobs" className={activeLinkClassName}>Jobs</NavLink>

        <NavLink to="/internships" className={activeLinkClassName}>Internships</NavLink>
        <NavLink to="/ai-tools" className={activeLinkClassName}>AI Tools</NavLink>
        {user?.role === "student" && (
          <NavLink to="/dashboard" className={activeLinkClassName}>
            Dashboard
          </NavLink>
        )}
        {user?.role === "company" && (
          <NavLink to="/company/dashboard" className={activeLinkClassName}>
            Dashboard
          </NavLink>
        )}
        {user?.role === "admin" && (
          <NavLink to="/admin/dashboard" className={activeLinkClassName}>
            Dashboard
          </NavLink>
        )}
        {user?.role === "student" && (
          <NavLink to="/applications" className={activeLinkClassName}>
            Applications
          </NavLink>
        )}
      </nav>

      <div className="nav-actions">
        {isAuthenticated ? (
          <>
            <NotificationBell />
            <Link to="/account" className="nav-user-name">{user.name}</Link>
            <button type="button" className="btn btn-outline" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-outline">Login</Link>
            <Link to="/register" className="btn btn-primary">Register</Link>
          </>
        )}

      </div>

      <button
        type="button"
        className="menu-button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation-menu"
      >
        ☰
      </button>

      <nav
        className="mobile-menu"
        id="mobile-navigation-menu"
        aria-label="Mobile navigation"
        hidden={!menuOpen}
      >
          <NavLink to="/" end className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
            Home
          </NavLink>
          <NavLink to="/jobs" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
            Jobs
          </NavLink>
          <NavLink to="/internships" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
            Internships
          </NavLink>
          <NavLink to="/ai-tools" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
            AI Tools
          </NavLink>
          {user?.role === "student" && (
            <NavLink to="/dashboard" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
              Dashboard
            </NavLink>
          )}
          {user?.role === "company" && (
            <NavLink to="/company/dashboard" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
              Dashboard
            </NavLink>
          )}
          {user?.role === "admin" && (
            <NavLink to="/admin/dashboard" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
              Dashboard
            </NavLink>
          )}
          {user?.role === "student" && (
            <NavLink to="/applications" className={activeLinkClassName} onClick={() => setMenuOpen(false)}>
              My applications
            </NavLink>
          )}
          {isAuthenticated ? (
            <>
              <NavLink
                to="/notifications"
                className={activeLinkClassName}
                onClick={() => setMenuOpen(false)}
              >
                Notifications
              </NavLink>
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  `mobile-auth-link nav-user-name${isActive ? " is-active" : ""}`
                }
                onClick={() => setMenuOpen(false)}
              >
                {user.name}
              </NavLink>
              <button type="button" className="mobile-auth-link" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="mobile-auth-link" onClick={() => setMenuOpen(false)}>
                Login
              </Link>
              <Link to="/register" className="mobile-auth-link" onClick={() => setMenuOpen(false)}>
                Register
              </Link>
            </>
          )}
      </nav>
    </header>
  );
}

export default Navbar;