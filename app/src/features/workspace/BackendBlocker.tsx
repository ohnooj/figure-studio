export function BackendBlocker(props: { status: string }) {
  return (
    <div className="backend-blocker">
      <div className="backend-card">
        <h1>Backend Required</h1>
        <p>The figure studio needs the FastAPI backend to load sources, watch files, and persist edits.</p>
        <pre>{`python3 -m uvicorn backend.app:app --reload --port 8123`}</pre>
        <p className="backend-error">Last error: {props.status}</p>
      </div>
    </div>
  );
}
