import fs from "fs";
import path from "path";
import { extractNotebookImagesAndRewrite } from "./extract-notebook-images.js";

/**
 * Convert Pythonly `.pyy` (nbformat-ish JSON) into a strict nbformat v4 `.ipynb`
 * for GitHub rendering.
 *
 * Goals:
 * - Remove Pythonly-only fields (e.g. root `pyyFormat`, per-cell `codeCellIndex`)
 * - Normalize multiline fields to string arrays (cell.source, stream.text, traceback)
 * - Ensure code cells have integer execution_count (deterministic)
 * - Preserve outputs (but normalize their shapes)
 */

function usageAndExit(code) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node scripts/pyy-to-ipynb.js <file1.pyy> [file2.pyy ...]",
      "  node scripts/pyy-to-ipynb.js --all-curricula",
    ].join("\n"),
  );
  process.exit(code);
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

// Split into lines while keeping newline characters (like Python's splitlines(True)).
function toLineArray(s) {
  if (isStringArray(s)) return s;
  if (s == null) return [];
  if (typeof s !== "string") return [];
  if (s.length === 0) return [];
  const matches = s.match(/.*(?:\n|$)/g) ?? [];
  // `match` usually ends with a trailing "" because of `$`; remove it.
  if (matches.length > 0 && matches[matches.length - 1] === "") matches.pop();
  return matches;
}

function normalizeOutput(output) {
  if (!output || typeof output !== "object") return output;

  // GitHub rendering compatibility: normalize update_display_data into display_data.
  // (Some renderers/validators reject update_display_data.)
  if (output.output_type === "update_display_data") {
    output.output_type = "display_data";
  }

  // stream: { name, text }
  if (output.output_type === "stream") {
    if (typeof output.text === "string" || Array.isArray(output.text)) {
      output.text = toLineArray(output.text);
    }
    return output;
  }

  // error: { ename, evalue, traceback }
  if (output.output_type === "error") {
    if (typeof output.traceback === "string" || Array.isArray(output.traceback)) {
      output.traceback = toLineArray(output.traceback);
    }
    return output;
  }

  // display_data / execute_result:
  // Some emitters may incorrectly store multiline text/plain as a single string.
  if (output.output_type === "display_data" || output.output_type === "execute_result") {
    // If data is incorrectly a primitive, coerce to text/plain.
    if (typeof output.data === "string") {
      output.data = { "text/plain": toLineArray(output.data) };
    } else if (output.data == null || typeof output.data !== "object" || Array.isArray(output.data)) {
      output.data = { "text/plain": toLineArray(String(output.data ?? "")) };
    } else {
      for (const [mime, val] of Object.entries(output.data)) {
        if (typeof val === "string" && (mime === "text/plain" || mime === "text/markdown")) {
          output.data[mime] = toLineArray(val);
        }
      }
    }
    return output;
  }

  return output;
}

function normalizeCell(cell) {
  const out = { ...cell };

  // Remove Pythonly-only fields at cell level.
  delete out.codeCellIndex;

  if (!out.metadata || typeof out.metadata !== "object") out.metadata = {};

  // Normalize `source` into a string[] (strict tooling expects this).
  out.source = toLineArray(out.source);

  if (out.cell_type === "code") {
    if (!Array.isArray(out.outputs)) out.outputs = [];
    out.outputs = out.outputs.map((o) => normalizeOutput(o));
    // execution_count normalized later to keep deterministic ordering.
  } else {
    // nbformat: non-code cells must not have code-only fields.
    delete out.outputs;
    delete out.execution_count;
  }

  return out;
}

function normalizeNotebook(nb) {
  const out = { ...nb };

  // Required top-level fields.
  out.nbformat = 4;
  out.nbformat_minor = typeof out.nbformat_minor === "number" ? out.nbformat_minor : 5;
  if (!out.metadata || typeof out.metadata !== "object") out.metadata = {};

  // Remove Pythonly-only fields.
  delete out.pyyFormat;

  if (!Array.isArray(out.cells)) out.cells = [];
  out.cells = out.cells.map((c) => normalizeCell(c));

  // Ensure integer execution_count for code cells (deterministic).
  let execCounter = 1;
  out.cells = out.cells.map((c) => {
    if (c.cell_type !== "code") return c;
    const next = { ...c };
    if (typeof next.execution_count !== "number" || !Number.isFinite(next.execution_count)) {
      next.execution_count = execCounter;
    } else {
      // Keep existing if it's already a valid number, but still advance counter
      // to avoid duplicates when later cells are null.
      next.execution_count = Math.trunc(next.execution_count);
      if (next.execution_count < 0) next.execution_count = execCounter;
    }
    execCounter += 1;
    return next;
  });

  // Ensure execute_result outputs have execution_count (strict tooling).
  out.cells = out.cells.map((c) => {
    if (c.cell_type !== "code") return c;
    if (!Array.isArray(c.outputs) || c.outputs.length === 0) return c;
    const next = { ...c };
    next.outputs = c.outputs.map((o) => {
      if (!o || typeof o !== "object") return o;
      if (o.output_type === "execute_result") {
        const oo = { ...o };
        if (typeof oo.execution_count !== "number" || !Number.isFinite(oo.execution_count)) {
          oo.execution_count = next.execution_count;
        } else {
          oo.execution_count = Math.trunc(oo.execution_count);
          if (oo.execution_count < 0) oo.execution_count = next.execution_count;
        }
        return oo;
      }
      return o;
    });
    return next;
  });

  // Extract data-URI images (markdown + outputs) into per-notebook `<notebook>.images/`
  // and rewrite references to relative file paths for GitHub rendering.
  //
  // NOTE: This runs later in convertOnePyy() where we know the target notebook path.

  return out;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJsonFile(filePath, obj) {
  const serialized = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(filePath, serialized, "utf8");
}

function convertOnePyy(pyyPath) {
  const abs = path.resolve(pyyPath);
  const ipynbPath = abs.replace(/\.pyy$/i, ".ipynb");

  const src = readJsonFile(abs);
  const nb0 = normalizeNotebook(src);
  const nb = extractNotebookImagesAndRewrite(nb0, path.resolve(ipynbPath));
  writeJsonFile(ipynbPath, nb);

  return { pyyPath: abs, ipynbPath };
}

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
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) usageAndExit(2);

  let files = [];
  if (args.length === 1 && args[0] === "--all-curricula") {
    const curriculaDir = path.resolve("curricula");
    if (!fs.existsSync(curriculaDir)) {
      // eslint-disable-next-line no-console
      console.error(`curricula/ not found at: ${curriculaDir}`);
      process.exit(1);
    }
    files = walkDir(curriculaDir).filter((f) => f.toLowerCase().endsWith(".pyy"));
  } else {
    files = args;
  }

  const converted = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".pyy")) continue;
    converted.push(convertOnePyy(f));
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Converted ${converted.length} file(s)`);
}

main();


