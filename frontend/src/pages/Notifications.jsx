import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import api from "../services/api";
import { apiErrorMessage } from "../utils/apiErrorMessage";
import "../notifications.css";

const pageSize = 20;

const formatTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async (signal) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await api.get("/notifications", {
        params: { page, limit: pageSize },
        signal,
      });
      if (signal.aborted) return;
      setNotifications(response.data.data || []);
      setUnreadCount(response.data.unreadCount || 0);
      setPages(Math.max(1, response.data.pagination?.pages || 1));
    } catch (requestError) {
      if (requestError.code === "ERR_CANCELED") return;
      if (!signal.aborted) {
        setError(apiErrorMessage(requestError, "We could not load your notifications."));
      }
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadNotifications(controller.signal));
    return () => controller.abort();
  }, [loadNotifications, refreshCount]);

  const markAllRead = async () => {
    setIsMarkingAll(true);
    setActionError("");
    try {
      await api.patch("/notifications/read-all");
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (requestError) {
      setActionError(apiErrorMessage(requestError, "Notifications could not be updated."));
    } finally {
      setIsMarkingAll(false);
    }
  };

  const markRead = async (notification) => {
    if (notification.isRead) return true;
    setBusyId(notification._id);
    setActionError("");
    try {
      await api.patch(`/notifications/${notification._id}/read`);
      setNotifications((current) =>
        current.map((item) =>
          item._id === notification._id ? { ...item, isRead: true } : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      return true;
    } catch (requestError) {
      setActionError(apiErrorMessage(requestError, "This notification could not be marked as read."));
      return false;
    } finally {
      setBusyId("");
    }
  };

  const openNotification = async (notification) => {
    if (!(await markRead(notification))) return;
    if (notification.link?.startsWith("/") && !notification.link.startsWith("//")) {
      navigate(notification.link);
    }
  };

  const deleteNotification = async (notification) => {
    setBusyId(notification._id);
    setActionError("");
    try {
      await api.delete(`/notifications/${notification._id}`);
      if (!notification.isRead) setUnreadCount((count) => Math.max(0, count - 1));
      if (notifications.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setNotifications((current) => current.filter((item) => item._id !== notification._id));
        setRefreshCount((count) => count + 1);
      }
    } catch (requestError) {
      setActionError(apiErrorMessage(requestError, "This notification could not be deleted."));
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
      <Navbar />
      <main className="notifications-page">
        <header className="notifications-page-header">
          <div>
            <p className="notifications-eyebrow">YOUR ACTIVITY</p>
            <h1>Notifications</h1>
            <p>
              {unreadCount
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "You’re up to date."}
            </p>
          </div>
          <button type="button" onClick={markAllRead} disabled={!unreadCount || isMarkingAll}>
            {isMarkingAll ? "Saving…" : "Mark all as read"}
          </button>
        </header>

        {actionError && <p className="notifications-alert" role="alert">{actionError}</p>}
        {error ? (
          <section className="notifications-state notifications-state-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button>
          </section>
        ) : isLoading ? (
          <p className="notifications-state" role="status">Loading notifications…</p>
        ) : notifications.length ? (
          <ul className="notifications-list">
            {notifications.map((notification) => (
              <li
                className={`notifications-card ${notification.isRead ? "is-read" : "is-unread"}`}
                key={notification._id}
              >
                <button
                  type="button"
                  className="notifications-card-content"
                  onClick={() => openNotification(notification)}
                  disabled={busyId === notification._id}
                >
                  <span className="notifications-card-heading">
                    <strong>{notification.title}</strong>
                    {!notification.isRead && <span className="notification-unread-dot" aria-label="Unread" />}
                  </span>
                  <span>{notification.message}</span>
                  <time dateTime={notification.createdAt}>{formatTimestamp(notification.createdAt)}</time>
                </button>
                <div className="notifications-card-actions">
                  {!notification.isRead && (
                    <button type="button" onClick={() => markRead(notification)} disabled={busyId === notification._id}>
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    className="notifications-delete-button"
                    onClick={() => deleteNotification(notification)}
                    disabled={busyId === notification._id}
                    aria-label={`Delete ${notification.title}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <section className="notifications-state">
            {page > 1 ? "No notifications on this page." : "No notifications yet."}
          </section>
        )}

        {!error && pages > 1 && (
          <nav className="notifications-pagination" aria-label="Notification pages">
            <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1 || isLoading}>
              Previous
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= pages || isLoading}>
              Next
            </button>
          </nav>
        )}
      </main>
      <Footer />
    </>
  );
}

export default Notifications;
