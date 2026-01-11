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
}

// Strict validation for generated mirrors (GitHub-like schema enforcement).
const ipynbFiles = files.map((f) => f.replace(/\.pyy$/, ".ipynb"));
execSync(`node scripts/check-nbformat-strict.js ${ipynbFiles.map((p) => `"${p}"`).join(" ")}`, {
  stdio: "inherit",
});
