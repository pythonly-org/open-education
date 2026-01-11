import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const files = execSync("git diff --cached --name-only", { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => f.endsWith(".pyy"));

if (files.length === 0) process.exit(0);

// Convert only staged .pyy files, then stage the resulting .ipynb mirrors.
for (const f of files) {
  execSync(`node scripts/pyy-to-ipynb.js "${f}"`, { stdio: "inherit" });
  const target = f.replace(/\.pyy$/, ".ipynb");
  execSync(`git add "${target}"`);

  // Stage per-notebook extracted images (may include deletions due to regen).
  const imagesDir = path.resolve(target).replace(/\.ipynb$/, ".images");
  if (fs.existsSync(imagesDir)) {
    execSync(`git add -A -- "${imagesDir}"`);
  } else {
    // If the folder was removed (no images), stage deletions only if git previously tracked it.
    const tracked = execSync(`git ls-files -- "${imagesDir}"`, { encoding: "utf8" }).trim();
    if (tracked.length > 0) {
      execSync(`git add -A -- "${imagesDir}"`);
    }
  }
}

// Strict validation for generated mirrors (GitHub-like schema enforcement).
const ipynbFiles = files.map((f) => f.replace(/\.pyy$/, ".ipynb"));
execSync(`node scripts/check-nbformat-strict.js ${ipynbFiles.map((p) => `"${p}"`).join(" ")}`, {
  stdio: "inherit",
});
