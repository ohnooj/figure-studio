import type { ToastTone } from "../../shared/types/editor";

export function Toast(props: { message: string; tone: ToastTone; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`toast toast-${props.tone} ${props.onClick ? "toast-clickable" : ""}`}
      onClick={props.onClick}
    >
      {props.message}
    </button>
  );
}
