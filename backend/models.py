from typing import cast

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class WorkspacePayload(ApiModel):
    version: int = 3
    figures: list[dict[str, object]] = Field(default_factory=lambda: cast(list[dict[str, object]], []))
    bookmarks: list[dict[str, object]] = Field(default_factory=lambda: cast(list[dict[str, object]], []))
    recent_figure_ids: list[str] = Field(default_factory=list)


class FigureCreatePayload(ApiModel):
    id: str = ""
    title: str = ""
    template_id: str = "blank"


class FigureMetadataPayload(ApiModel):
    title: str
    description: str = ""


class FigureSourceSavePayload(ApiModel):
    svg: str


class PublishPayload(ApiModel):
    figure_id: str
    sources: list[str]
    targets: list[str]


class ExportBundlePayload(ApiModel):
    figure_id: str
    svg: str
    text: str | None = None


class AssetImportPayload(ApiModel):
    source_path: str


class DebugLogEventPayload(ApiModel):
    label: str
    payload: object | None = None
    source: str = "frontend"
    client_timestamp: str | None = None


class DebugLogPayload(ApiModel):
    label: str | None = None
    payload: object | None = None
    source: str = "frontend"
    client_timestamp: str | None = None
    events: list[DebugLogEventPayload] = Field(default_factory=lambda: cast(list[DebugLogEventPayload], []))


class CodexThreadCreatePayload(ApiModel):
    figure_id: str
    title: str = ""
    scope: str = "figure"
    model: str | None = None
    reasoning_effort: str | None = None
    sandbox_mode: str = "workspace-write"
    approval_policy: str = "never"
    personality: str | None = None


class CodexThreadUpdatePayload(ApiModel):
    title: str | None = None
    archived: bool | None = None
    scope: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None
    sandbox_mode: str | None = None
    approval_policy: str | None = None
    personality: str | None = None


class CodexRunCreatePayload(ApiModel):
    prompt: str
    active_figure_id: str
    results_count: int = 1
    revision_variant_ids: list[str] = Field(default_factory=list)
    figure_context: dict[str, object] = Field(default_factory=lambda: cast(dict[str, object], {}))


class CodexVariantMarkPayload(ApiModel):
    marked: bool = False


class CodexVariantInteractivePayload(ApiModel):
    state: dict[str, object] = Field(default_factory=lambda: cast(dict[str, object], {}))
    preview_svg: str | None = None
    status: str | None = None
