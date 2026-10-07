import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";
import "../notifications.css";

const relativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const unit = units.find(([, size]) => Math.abs(seconds) >= size);
  return unit
    ? formatter.format(Math.round(seconds / unit[1]), unit[0])
    : formatter.format(seconds, "second");
};

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async (signal) => {
    setError("");
    try {
      const response = await api.get("/notifications", {
        params: { page: 1, limit: 5 },
        signal,
      });
      if (signal?.aborted) return;
      setNotifications(response.data.data || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (requestError) {
      if (requestError.code === "ERR_CANCELED") return;
      if (!signal?.aborted) {
        setError(apiErrorMessage(requestError, "Notifications could not be loaded."));
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadNotifications(controller.signal));
    const timer = window.setInterval(() => loadNotifications(), 60000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const openNotification = async (notification) => {
    if (!notification.isRead) {
      try {
        await api.patch(`/notifications/${notification._id}/read`);
        setNotifications((current) =>
          current.map((item) =>
            item._id === notification._id ? { ...item, isRead: true } : item
          )
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (requestError) {
        setError(apiErrorMessage(requestError, "This notification could not be marked as read."));
        return;
      }
    }
    setIsOpen(false);
    if (notification.link?.startsWith("/") && !notification.link.startsWith("//")) {
      navigate(notification.link);
    } else {
      navigate("/notifications");
    }
  };

  const markAllRead = async () => {
    setIsMarkingAll(true);
    setError("");
    try {
      await api.patch("/notifications/read-all");
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Notifications could not be updated."));
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
        aria-controls="notification-bell-popover"
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="notification-popover"
          id="notification-bell-popover"
          aria-label="Recent notifications"
        >
          <header className="notification-popover-header">
            <h2>Notifications</h2>
            <button type="button" onClick={markAllRead} disabled={!unreadCount || isMarkingAll}>
              {isMarkingAll ? "Saving…" : "Mark all as read"}
            </button>
          </header>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {isLoading ? (
            <p className="notification-empty" role="status">Loading notifications…</p>
          ) : notifications.length ? (
            <ul className="notification-popover-list">
              {notifications.map((notification) => (
                <li key={notification._id}>
                  <button
                    type="button"
                    className={`notification-popover-item ${notification.isRead ? "is-read" : "is-unread"}`}
                    onClick={() => openNotification(notification)}
                  >
                    <span className="notification-item-heading">
                      <strong>{notification.title}</strong>
                      {!notification.isRead && <span className="notification-unread-dot" aria-label="Unread" />}
                    </span>
                    <span className="notification-item-message">{notification.message}</span>
                    <time dateTime={notification.createdAt}>{relativeTime(notification.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">
              {error ? "Notifications are unavailable right now." : "You’re all caught up."}
            </p>
          )}
          <footer className="notification-popover-footer">
            <Link to="/notifications" onClick={() => setIsOpen(false)}>View all notifications</Link>
          </footer>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
