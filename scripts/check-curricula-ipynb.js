import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function walkDir(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkDir(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const curriculaDir = path.resolve("curricula");
  if (!fs.existsSync(curriculaDir)) {
    // eslint-disable-next-line no-console
    console.error(`curricula/ not found at: ${curriculaDir}`);
    process.exit(1);
  }

  const ipynbFiles = walkDir(curriculaDir).filter((f) => f.toLowerCase().endsWith(".ipynb"));
  if (ipynbFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No curricula .ipynb files found");
    return;
  }

  const res = spawnSync(process.execPath, ["scripts/check-nbformat-strict.js", ...ipynbFiles], {
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}

main();


