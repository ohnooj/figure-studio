# Figure Studio

[![Quality](https://github.com/ohnooj/figure-studio/actions/workflows/quality.yml/badge.svg)](https://github.com/ohnooj/figure-studio/actions/workflows/quality.yml)
[![Security](https://github.com/ohnooj/figure-studio/actions/workflows/security.yml/badge.svg)](https://github.com/ohnooj/figure-studio/actions/workflows/security.yml)
[![CodeQL](https://github.com/ohnooj/figure-studio/actions/workflows/codeql.yml/badge.svg)](https://github.com/ohnooj/figure-studio/actions/workflows/codeql.yml)
[![Maintenance Audit](https://github.com/ohnooj/figure-studio/actions/workflows/maintenance-audit.yml/badge.svg)](https://github.com/ohnooj/figure-studio/actions/workflows/maintenance-audit.yml)

Figure Studio is an SVG-first editor for building and revising paper figures in this repository. The source of truth for each figure is `figures/<figure-id>/figure.svg`, and the app is built around editing those SVGs directly rather than generating figures from another format.

## Purpose

Use this repo to:

- create new figures from the maintained SVG templates
- edit existing figures in a structured canvas/inspector workflow
- export versioned deliverables such as SVG, PDF, and caption artifacts
- review proposed figure edits through Codex staging before applying them to live files

## Setup From Scratch

Requirements:

- Python 3
- Node.js and npm

Install frontend dependencies:

```bash
cd app
npm install
```

Install backend dependencies:

```bash
python3 -m pip install -r backend/requirements.txt
```

Start the backend:

```bash
python3 -m uvicorn backend.app:app --reload --port 8123
```

Start the frontend in a second terminal:

```bash
cd app
npm run dev
```

If the frontend needs an explicit API target:

```bash
cd app
VITE_API_ROOT=http://127.0.0.1:8123 npm run dev
```

## Quality And Security

Local quality gate:

```bash
make check
```

Local security-focused checks:

```bash
cd app
npm run check:security
```

GitHub automation:

- `quality`: frontend and backend formatting, lint, type checks, unit tests, compile checks, and production build
- `security`: npm dependency audit, Python dependency audit via `pip-audit`, OSV dependency scanning, Trivy repository scanning, and Gitleaks secret scanning
- `codeql`: GitHub code scanning for TypeScript/TSX and Python
- `maintenance-audit`: repo maintenance checks such as dead code and dependency boundaries

Repository settings recommended on GitHub:

- enable Dependabot alerts and Dependabot security updates
- enable GitHub secret scanning where your repo plan supports it
- protect `main` with required status checks for `quality`, `security`, and `codeql`

## Workflow

1. Open the app and select an existing figure or create one from a template.
2. Edit the figure directly in the SVG canvas using the hierarchy and inspector panels.
3. Save to update the canonical `figure.svg` for that figure.
4. Export when you want a versioned output bundle under `exports/<figure-id>/v###/`.
5. Publish when you want the latest exported assets copied to the destinations configured in `workspace.json`.

## Codex Review Workflow

Codex runs in review-first mode. Proposed changes are made in staged workspace copies first, then explicitly applied back to live files.

- figure-scoped chats stage the active figure
- `/global` stages the wider figures workspace for multi-figure changes
- prompts can produce multiple variants, and each variant stays pending until you apply or reject it
- applying a result writes the selected staged change back to the live figure or workspace

The backend stores Codex runtime state in `.codex_chat/`. That directory is local runtime data and should remain untracked.

## Repo Rules

- `figure.svg` is the source of truth for each figure
- figure assets stay figure-local under `figures/<figure-id>/assets/`
- saved SVGs should keep stable semantic ids where possible
- use `data-figure-role` values such as `panel`, `slot`, `text`, `item`, and `group` when relevant
- image slots should continue using `data-asset-path`
- do not store editor-only state or generated layout metadata in saved SVG files
- do not reintroduce the old HTML/CSS figure workflow
