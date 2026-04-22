from backend.codex_prompts import compose_turn_prompt
from pytest import MonkeyPatch


def test_compose_turn_prompt_uses_target_context_without_live_figure_context(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr("backend.codex_prompts.workspace_summary", lambda: [{"figureId": "teaser"}])

    prompt = compose_turn_prompt(
        "Adjust spacing",
        figure_context={},
        target_figure={"figureId": "teaser", "figureTitle": "Teaser"},
        scope="figure",
    )

    assert "Figure target context (JSON)" in prompt
    assert '"figureId": "teaser"' in prompt


def test_compose_turn_prompt_embeds_global_workspace_context(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr("backend.codex_prompts.workspace_summary", lambda: [{"figureId": "teaser"}])

    prompt = compose_turn_prompt(
        "Compare layouts",
        figure_context={"figureId": "teaser", "selectedIds": ["node-a"], "selectedObjects": [], "annotations": [], "svg": "<svg />"},
        target_figure={"figureId": "teaser", "figureTitle": "Teaser"},
        scope="global",
    )

    assert "Global figure workspace context (JSON)" in prompt
    assert '"activeFigureContext"' in prompt
    assert '"selectedIds": [' in prompt
