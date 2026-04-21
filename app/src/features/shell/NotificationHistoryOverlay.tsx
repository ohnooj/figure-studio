import type { NotificationEntry } from "../../shared/types/editor";

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function NotificationHistoryOverlay(props: {
  entries: NotificationEntry[];
  onClose: () => void;
}) {
  return (
    <div className="modal-scrim" onClick={props.onClose}>
      <div className="notifications-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <h2>Error Notifications</h2>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
        {props.entries.length ? (
          <div className="notifications-list">
            {props.entries.map((entry) => (
              <article key={entry.id} className={`notification-entry notification-entry-${entry.tone}`}>
                <div className="notification-entry-header">
                  <span className="notification-entry-label">{entry.tone}</span>
                  <time className="notification-entry-time" dateTime={new Date(entry.createdAt).toISOString()}>
                    {formatTimestamp(entry.createdAt)}
                  </time>
                </div>
                <p className="notification-entry-message">{entry.message}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No error notifications yet.</div>
        )}
      </div>
    </div>
  );
}
