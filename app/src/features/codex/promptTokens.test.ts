import { describe, expect, it } from "vitest";

import {
  parsePromptSegments,
  serializePromptReferenceToken,
} from "./promptTokens";

describe("prompt reference chips", () => {
  it("parses serialized reference chips from prompt text", () => {
    const value = `Ref ${serializePromptReferenceToken({ kind: "object", id: "slot-a", label: "Slot A", objectKind: "slot" })}`;
    const segments = parsePromptSegments(value);

    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({
      type: "token",
      token: {
        kind: "object",
        id: "slot-a",
        label: "Slot A",
        objectKind: "slot",
      },
    });
  });
});
