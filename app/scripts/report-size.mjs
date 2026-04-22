import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src"];
const entries = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) {
      continue;
    }
    entries.push({
      path: relative(process.cwd(), fullPath),
      bytes: statSync(fullPath).size,
    });
  }
}

for (const root of roots) {
  walk(root);
}

entries.sort((left, right) => right.bytes - left.bytes);

console.log("Largest tracked frontend files");
for (const entry of entries.slice(0, 15)) {
  console.log(`${String(entry.bytes).padStart(7, " ")}  ${entry.path}`);
}
