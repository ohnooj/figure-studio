from pathlib import Path

from backend.codex_store import CodexStore


def test_codex_store_round_trip(tmp_path: Path) -> None:
    store = CodexStore(tmp_path / "chat.sqlite3")
    thread = store.create_thread(
        figure_id="teaser",
        scope="figure",
        title="Smoke",
        model="gpt-5.4",
        reasoning_effort="medium",
        sandbox_mode="workspace-write",
        approval_policy="never",
        personality=None,
    )

    run = store.create_run(
        thread_id=thread["id"],
        prompt="Adjust the figure",
        target_figure_id="teaser",
        scope_snapshot="figure",
        results_count=1,
        figure_context={"figureId": "teaser", "svg": "<svg />", "selectedIds": [], "selectedObjects": [], "annotations": []},
    )
    variant = store.create_variant(
        run_id=run["id"],
        variant_index=0,
        label="Option 1",
        staging_dir=str(tmp_path / "variant"),
    )

    fetched = store.get_run(run["id"])

    assert fetched["threadId"] == thread["id"]
    assert fetched["variants"][0]["id"] == variant["id"]
