export function CaptionPanel(props: {
  bottomPanelHeight: number;
  descriptionDraft: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="caption-panel panel" style={{ height: `${props.bottomPanelHeight}px` }}>
      <div className="section-heading">
        <h2>Description</h2>
      </div>
      <textarea
        className="caption-textarea"
        value={props.descriptionDraft}
        onChange={(event) => props.onChange(event.target.value)}
        rows={5}
        placeholder="Write the figure caption/description here for LaTeX export."
      />
    </div>
  );
}
