import type { TemplateEntry } from "../../shared/types/editor";

export function TemplatePickerModal(props: {
  templates: TemplateEntry[];
  busy: boolean;
  onClose: () => void;
  onCreate: (templateId: string) => void;
}) {
  return (
    <div className="modal-scrim" onClick={props.onClose}>
      <div className="template-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <h2>New SVG Figure</h2>
          <button onClick={props.onClose}>Close</button>
        </div>
        <div className="template-grid">
          {props.templates.map((template) => (
            <button
              key={template.id}
              className="template-card"
              disabled={props.busy}
              onClick={() => props.onCreate(template.id)}
            >
              <span className="template-title">{template.title}</span>
              <span className="template-copy">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
