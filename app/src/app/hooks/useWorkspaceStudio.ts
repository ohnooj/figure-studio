import { useEffect, useRef, useState } from "react";

import { fetchFigureAssets } from "../../shared/api/assets";
import { createFigureFromTemplate, fetchFigure, updateFigureMetadata } from "../../shared/api/figures";
import { API_ROOT } from "../../shared/api/client";
import { fetchBackendHealth, fetchTemplates, fetchWorkspace } from "../../shared/api/workspace";
import type { ActionState, BackendState, FigureAssets, FigureEntry, FigureSource, TemplateEntry, Workspace } from "../../shared/types/editor";

export function useWorkspaceStudio() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [sources, setSources] = useState<Record<string, FigureSource>>({});
  const [assets, setAssets] = useState<Record<string, FigureAssets>>({});
  const [activeFigureId, setActiveFigureId] = useState(() => window.localStorage.getItem("paper_figures.activeFigureId") ?? "");
  const [backendState, setBackendState] = useState<BackendState>("connecting");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [status, setStatus] = useState("Connecting to backend...");
  const [renamingFigureId, setRenamingFigureId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const workspaceRef = useRef<Workspace | null>(null);
  const activeFigureRef = useRef("");

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    activeFigureRef.current = activeFigureId;
  }, [activeFigureId]);

  useEffect(() => {
    if (activeFigureId) {
      window.localStorage.setItem("paper_figures.activeFigureId", activeFigureId);
    } else {
      window.localStorage.removeItem("paper_figures.activeFigureId");
    }
  }, [activeFigureId]);

  async function loadWorkspace(options?: { quiet?: boolean; preserveActive?: boolean }): Promise<void> {
    const quiet = options?.quiet ?? false;
    const preserveActive = options?.preserveActive ?? true;
    try {
      const nextWorkspace = await fetchWorkspace();
      setWorkspace(nextWorkspace);
      const nextActive =
        preserveActive && activeFigureRef.current && nextWorkspace.figures.some((figure) => figure.id === activeFigureRef.current)
          ? activeFigureRef.current
          : nextWorkspace.recentFigureIds[0] ?? nextWorkspace.figures[0]?.id ?? "";
      setActiveFigureId(nextActive);
      if (!quiet) {
        setStatus("Workspace loaded.");
      }
    } catch (error) {
      setBackendState("error");
      setStatus(error instanceof Error ? error.message : "Workspace load failed.");
    }
  }

  async function loadTemplates(): Promise<void> {
    try {
      const payload = await fetchTemplates();
      setTemplates(payload.templates);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Template load failed.");
    }
  }

  async function loadAssets(figureId: string, quiet = false): Promise<void> {
    try {
      const payload = await fetchFigureAssets(figureId);
      setAssets((current) => ({ ...current, [figureId]: payload }));
      if (!quiet) {
        setStatus(`Loaded assets for ${figureId}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Asset load failed.");
    }
  }

  async function loadFigure(figureId: string, quiet = false): Promise<void> {
    try {
      const payload = await fetchFigure(figureId);
      setSources((current) => ({ ...current, [figureId]: payload }));
      setActiveFigureId(figureId);
      await loadAssets(figureId, true);
      if (!quiet) {
        setStatus(`Opened ${payload.figure.title}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Figure load failed.");
    }
  }

  async function createFigure(templateId: string): Promise<void> {
    try {
      setActionState("saving");
      const payload = await createFigureFromTemplate(templateId);
      setTemplatePickerOpen(false);
      await loadWorkspace({ quiet: true, preserveActive: false });
      await loadFigure(payload.id, true);
      setStatus(`Created ${payload.id}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Figure creation failed.");
    } finally {
      setActionState("idle");
    }
  }

  function beginRename(figure: FigureEntry): void {
    setRenamingFigureId(figure.id);
    setRenameDraft(figure.title);
  }

  function cancelRename(): void {
    setRenamingFigureId("");
    setRenameDraft("");
  }

  async function commitRename(figureId: string): Promise<void> {
    const title = renameDraft.trim();
    if (!title) {
      cancelRename();
      setStatus("Figure name cannot be empty.");
      return;
    }
    try {
      setActionState("saving");
      const existing = sources[figureId]?.figure.description ?? workspace?.figures.find((figure) => figure.id === figureId)?.description ?? "";
      const payload = await updateFigureMetadata(figureId, { title, description: existing });
      setWorkspace((current) =>
        current
          ? {
              ...current,
              figures: current.figures.map((figure) => (figure.id === figureId ? payload.figure : figure)),
            }
          : current,
      );
      setSources((current) => {
        const existingSource = current[figureId];
        if (!existingSource) {
          return current;
        }
        return {
          ...current,
          [figureId]: {
            ...existingSource,
            figure: payload.figure,
          },
        };
      });
      setStatus(`Renamed to ${payload.figure.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Rename failed.");
    } finally {
      setActionState("idle");
      cancelRename();
    }
  }

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    void (async () => {
      try {
        await fetchBackendHealth();
        if (cancelled) {
          return;
        }
        setBackendState("ready");
        setStatus("Backend connected.");
        await Promise.all([loadWorkspace({ quiet: true, preserveActive: false }), loadTemplates()]);

        const initialWorkspace = workspaceRef.current;
        const initialFigureId =
          activeFigureRef.current || initialWorkspace?.recentFigureIds[0] || initialWorkspace?.figures[0]?.id || "";
        if (initialFigureId) {
          await loadFigure(initialFigureId, true);
        }

        source = new EventSource(`${API_ROOT}/api/events`);
        source.addEventListener("message", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { path: string };
          if (payload.path === "workspace.json") {
            void loadWorkspace({ quiet: true, preserveActive: true });
            return;
          }
          if (payload.path.startsWith("templates/")) {
            void loadTemplates();
            return;
          }
          const workspaceSnapshot = workspaceRef.current;
          for (const figure of workspaceSnapshot?.figures ?? []) {
            if (payload.path.startsWith(`${figure.folder}/`) || payload.path === figure.folder) {
              if (figure.id === activeFigureRef.current) {
                void loadFigure(figure.id, true);
              }
              return;
            }
          }
        });
        source.onerror = () => {
          setStatus("Live reload disconnected.");
        };
      } catch (error) {
        if (cancelled) {
          return;
        }
        setBackendState("error");
        setStatus(error instanceof Error ? error.message : "Backend unavailable.");
      }
    })();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    if (!activeFigureId) {
      const fallback = workspace.recentFigureIds[0] ?? workspace.figures[0]?.id ?? "";
      if (fallback) {
        void loadFigure(fallback, true);
      }
      return;
    }
    if (!sources[activeFigureId]) {
      void loadFigure(activeFigureId, true);
      return;
    }
    if (!assets[activeFigureId]) {
      void loadAssets(activeFigureId, true);
    }
  }, [workspace, activeFigureId, sources, assets]);

  return {
    workspace,
    setWorkspace,
    templates,
    sources,
    setSources,
    assets,
    setAssets,
    activeFigureId,
    setActiveFigureId,
    backendState,
    actionState,
    setActionState,
    status,
    setStatus,
    renamingFigureId,
    renameDraft,
    setRenameDraft,
    templatePickerOpen,
    setTemplatePickerOpen,
    workspaceRef,
    activeFigureRef,
    loadWorkspace,
    loadTemplates,
    loadAssets,
    loadFigure,
    createFigure,
    beginRename,
    cancelRename,
    commitRename,
  };
}
