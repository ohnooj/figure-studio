import { describe, expect, it } from "vitest";

import { extractInlineSlashCommands } from "./useCodexComposerState";

describe("extractInlineSlashCommands", () => {
  it("extracts supported inline slash commands and normalizes whitespace", () => {
    const value = "  tighten layout /plan  and compare /global   /fig ";
    const result = extractInlineSlashCommands(value);

    expect(result.commands).toEqual(["plan", "global", "fig"]);
    expect(result.prompt).toBe("tighten layout and compare");
  });

  it("leaves unknown slash commands untouched", () => {
    const value = "try /unknown then /compact";
    const result = extractInlineSlashCommands(value);

    expect(result.commands).toEqual(["compact"]);
    expect(result.prompt).toBe("try /unknown then");
  });
});
