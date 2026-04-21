export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function targetForExtension(targets: string[], extension: string): string | null {
  const normalized = extension.toLowerCase();
  return targets.find((target) => target.toLowerCase().endsWith(normalized)) ?? null;
}

export function escapeLatex(value: string): string {
  return value.replace(/[\\{}%$&#_^~]/g, (match) => {
    switch (match) {
      case "\\":
        return "\\textbackslash{}";
      case "{":
        return "\\{";
      case "}":
        return "\\}";
      case "%":
        return "\\%";
      case "$":
        return "\\$";
      case "&":
        return "\\&";
      case "#":
        return "\\#";
      case "_":
        return "\\_";
      case "^":
        return "\\textasciicircum{}";
      case "~":
        return "\\textasciitilde{}";
      default:
        return match;
    }
  });
}
