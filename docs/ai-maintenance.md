# AI Maintenance Playbook

Figure Studio uses a maintenance-first workflow for AI coding agents.

## Standard commands

- `make check` runs the full local maintenance gate.
- `make check-frontend` runs formatting, TypeScript, type-aware ESLint, dead-code detection, dependency-boundary checks, tests, and the frontend build.
- `make check-backend` runs Ruff, strict Pyright, Python compile checks, and backend smoke tests.
- `make fix` applies safe frontend autofixes only.
- `make audit-size` reports the largest frontend source files.

## Agent workflow

1. Run targeted checks before editing.
2. Make the smallest patch that solves the task.
3. Run targeted checks again.
4. Run `make check` before opening a PR when the change crosses frontend and backend boundaries.

## Cleanup policy

- Agents may remove clearly unused imports, exports, and small dead-code paths in normal task branches.
- Larger deletions, file moves, and architecture refactors should be grouped into dedicated cleanup PRs.
- If a rule needs a suppression, the PR must explain why it is temporary.
- The repo is expected to stay green against the strict gate. Do not weaken the checks to land a feature.

## Maintenance-first passes

Use dedicated AI passes for:

- dead-code cleanup from `knip`
- cycle removal from `dependency-cruiser`
- large-file splitting from `make audit-size`
- backend lint/type regressions from Ruff and Pyright
