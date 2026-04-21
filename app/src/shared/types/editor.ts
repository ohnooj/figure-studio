export type Bookmark = {
  alias: string;
  path: string;
};

export type FigureEntry = {
  id: string;
  title: string;
  description?: string;
  folder: string;
  entrySvg: string;
  templateId?: string;
  publishTargets: string[];
};

export type Workspace = {
  version: number;
  figures: FigureEntry[];
  bookmarks: Bookmark[];
  recentFigureIds: string[];
};

export type FigureSource = {
  figure: FigureEntry;
  svg: string;
  sourceFiles: string[];
};

export type AssetItem = {
  name: string;
  path: string;
  sourcePath: string;
  origin: "local" | "bookmark";
  bookmark?: string;
};

export type BookmarkAssets = {
  alias: string;
  path: string;
  items: AssetItem[];
};

export type FigureAssets = {
  local: AssetItem[];
  bookmarks: BookmarkAssets[];
};

export type TemplateEntry = {
  id: string;
  title: string;
  description: string;
  file: string;
};

export type BackendState = "connecting" | "ready" | "error";
export type ActionState = "idle" | "saving" | "exporting";
export type EditableKind = "canvas" | "panel" | "slot" | "text" | "item" | "group" | "curve";
export type ThemePreference = "light" | "dark" | "system";
export type ToastTone = "success" | "error" | "info";
export type NotificationEntry = {
  id: string;
  message: string;
  tone: ToastTone;
  createdAt: number;
};
export type InteractionMode = "resize" | "scale";
export type ToolMode =
  | "select"
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "image-slot"
  | "curve";

export type SelectedElement = {
  id: string;
  kind: EditableKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  assetPath: string;
  canResize: boolean;
  canScale: boolean;
  selectionCount?: number;
};

export type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ObjectNode = {
  id: string;
  label: string;
  kind: EditableKind;
  children: ObjectNode[];
};

export type AttributeEntry = {
  name: string;
  value: string;
};

export type InspectorStyle = {
  fill: string;
  stroke: string;
  "stroke-width": string;
  "stroke-dasharray": string;
  "stroke-linecap": string;
  "stroke-linejoin": string;
  opacity: string;
  "fill-opacity": string;
  "stroke-opacity": string;
  rx: string;
  ry: string;
  "font-family": string;
  "font-size": string;
  "font-weight": string;
  "font-style": string;
  "text-anchor": string;
};

export type InspectorCapabilities = {
  showAppearance: boolean;
  showFill: boolean;
  showStroke: boolean;
  showStrokeWidth: boolean;
  showStrokeDash: boolean;
  showLineCap: boolean;
  showLineJoin: boolean;
  showOpacity: boolean;
  showFillOpacity: boolean;
  showStrokeOpacity: boolean;
  showRadius: boolean;
  showTypography: boolean;
};

export type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
  artboardWidth: number;
  artboardHeight: number;
};

export type HistorySnapshot = {
  svg: string;
  description: string;
  selectedIds: string[];
  viewport: ViewportState;
  codex: {
    annotations: CodexAnnotation[];
    selectedId: string;
    tool: CodexAnnotationTool;
    color: string;
  };
};

export type AlignmentGuide = {
  orientation: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
};

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApprovalPolicy = "never" | "on-request" | "untrusted";
export type CodexThreadScope = "figure" | "global";
export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type CodexAnnotationTool = "select" | "highlight" | "arrow" | "freehand";
export type CodexAnnotationKind = "highlight" | "arrow" | "freehand" | "selection";

export type CodexSelectedObjectSummary = {
  id: string;
  label: string;
  kind: EditableKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  assetPath: string;
};

export type CodexAnnotation = {
  id: string;
  kind: CodexAnnotationKind;
  color: string;
  points: { x: number; y: number }[];
  selectedIds?: string[];
};

export type CodexFigureContext = {
  figureId: string;
  figureTitle: string;
  svg: string;
  selectedIds: string[];
  selectedObjects: CodexSelectedObjectSummary[];
  annotations: CodexAnnotation[];
  annotatedImageUrl?: string;
};

export type CodexRunEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type CodexVariantReviewState = "pending" | "applied" | "rejected";

export type CodexRunVariant = {
  id: string;
  runId: string;
  variantIndex: number;
  label: string;
  state: string;
  currentStatus: string | null;
  latestDiff: string | null;
  latestPreviewSvg: string | null;
  reviewState: CodexVariantReviewState;
  markedForRevision: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type CodexRun = {
  id: string;
  threadId: string;
  prompt: string;
  targetFigureId: string;
  scopeSnapshot: CodexThreadScope;
  resultsCount: number;
  reviewState: "pending" | "applied";
  appliedVariantId: string | null;
  state: string;
  codexTurnId: string | null;
  currentStatus: string | null;
  figureContext: CodexFigureContext;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  events: CodexRunEvent[];
  variants: CodexRunVariant[];
};

export type CodexThread = {
  id: string;
  figureId: string;
  scope: CodexThreadScope;
  title: string;
  codexThreadId: string | null;
  stagingDir: string;
  model: string | null;
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
  approvalPolicy: CodexApprovalPolicy;
  personality: string | null;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  runs: CodexRun[];
};
