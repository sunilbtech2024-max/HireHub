import statusLabels from "../utils/applicationStatus";

function ApplicationStatus({ status, history = [] }) {
  const events = [...history]
    .sort((first, second) => new Date(first.changedAt) - new Date(second.changedAt));

  return (
    <section className="application-status-section" aria-label="Application status history">
      <div className={`application-status-badge status-${status}`}>
        {statusLabels[status] || status}
      </div>
      <ol className="application-timeline">
        {events.map((event, index) => (
          <li className="application-timeline-event" key={`${event.status}-${event.changedAt}-${index}`}>
            <span className="application-timeline-marker" aria-hidden="true" />
            <div>
              <strong>{statusLabels[event.status] || event.status}</strong>
              {event.changedAt && (
                <time dateTime={event.changedAt}>
                  {new Date(event.changedAt).toLocaleString()}
                </time>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ApplicationStatus;
