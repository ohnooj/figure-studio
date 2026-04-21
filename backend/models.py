from pydantic import BaseModel, Field


class WorkspacePayload(BaseModel):
    version: int = 3
    figures: list[dict[str, object]] = Field(default_factory=list)
    bookmarks: list[dict[str, object]] = Field(default_factory=list)
    recentFigureIds: list[str] = Field(default_factory=list)


class FigureCreatePayload(BaseModel):
    id: str = ""
    title: str = ""
    templateId: str = "blank"

class FigureMetadataPayload(BaseModel):
    title: str
    description: str = ""


class FigureSourceSavePayload(BaseModel):
    svg: str


class PublishPayload(BaseModel):
    figureId: str
    sources: list[str]
    targets: list[str]

class ExportBundlePayload(BaseModel):
    figureId: str
    svg: str
    text: str | None = None


class AssetImportPayload(BaseModel):
    sourcePath: str


class DebugLogEventPayload(BaseModel):
    label: str
    payload: object | None = None
    source: str = "frontend"
    clientTimestamp: str | None = None


class DebugLogPayload(BaseModel):
    label: str | None = None
    payload: object | None = None
    source: str = "frontend"
    clientTimestamp: str | None = None
    events: list[DebugLogEventPayload] = Field(default_factory=list)


class CodexThreadCreatePayload(BaseModel):
    figureId: str
    title: str = ""
    scope: str = "figure"
    model: str | None = None
    reasoningEffort: str | None = None
    sandboxMode: str = "workspace-write"
    approvalPolicy: str = "never"
    personality: str | None = None


class CodexThreadUpdatePayload(BaseModel):
    title: str | None = None
    archived: bool | None = None
    scope: str | None = None
    model: str | None = None
    reasoningEffort: str | None = None
    sandboxMode: str | None = None
    approvalPolicy: str | None = None
    personality: str | None = None


class CodexRunCreatePayload(BaseModel):
    prompt: str
    activeFigureId: str
    resultsCount: int = 1
    revisionVariantIds: list[str] = Field(default_factory=list)
    figureContext: dict[str, object] = Field(default_factory=dict)


class CodexVariantMarkPayload(BaseModel):
    marked: bool = False
