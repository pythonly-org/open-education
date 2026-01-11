import fs from "fs";

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function assertNoExtraKeys(obj, allowed, where, path) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      fail(path, `${where}: unexpected field '${k}'`);
    }
  }
}

function assertType(val, type, where, path) {
  if (type === "array") {
    if (!Array.isArray(val)) fail(path, `${where}: expected array`);
    return;
  }
  if (type === "object") {
    if (!isPlainObject(val)) fail(path, `${where}: expected object`);
    return;
  }
  if (typeof val !== type) fail(path, `${where}: expected ${type}`);
}

function assertStringArray(val, where, path) {
  if (!Array.isArray(val)) fail(path, `${where}: expected string[]`);
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "string") fail(path, `${where}[${i}]: expected string`);
  }
}

function validateOutput(output, idx, path) {
  if (!isPlainObject(output)) fail(path, `cell.outputs[${idx}]: expected object`);
  if (typeof output.output_type !== "string") fail(path, `cell.outputs[${idx}].output_type: missing/invalid`);

  const t = output.output_type;

  if (t === "stream") {
    const allowed = new Set(["output_type", "name", "text", "metadata"]);
    assertNoExtraKeys(output, allowed, `stream output`, path);
    assertType(output.name, "string", `stream.name`, path);
    assertStringArray(output.text, `stream.text`, path);
    if (output.metadata !== undefined) assertType(output.metadata, "object", `stream.metadata`, path);
    return;
  }

  if (t === "error") {
    const allowed = new Set(["output_type", "ename", "evalue", "traceback"]);
    assertNoExtraKeys(output, allowed, `error output`, path);
    assertType(output.ename, "string", `error.ename`, path);
    assertType(output.evalue, "string", `error.evalue`, path);
    assertStringArray(output.traceback, `error.traceback`, path);
    return;
  }

  if (t === "display_data") {
    const allowed = new Set(["output_type", "data", "metadata", "transient"]);
    assertNoExtraKeys(output, allowed, `display_data output`, path);
    assertType(output.data, "object", `display_data.data`, path);
    if (output.metadata !== undefined) assertType(output.metadata, "object", `display_data.metadata`, path);
    if (output.transient !== undefined) assertType(output.transient, "object", `display_data.transient`, path);
    return;
  }

  if (t === "execute_result") {
    const allowed = new Set(["output_type", "data", "metadata", "execution_count"]);
    assertNoExtraKeys(output, allowed, `execute_result output`, path);
    assertType(output.data, "object", `execute_result.data`, path);
    assertType(output.metadata ?? {}, "object", `execute_result.metadata`, path);
    // GitHub/nbformat allows null, but we enforce integer for strictness.
    if (typeof output.execution_count !== "number") {
      fail(path, `execute_result.execution_count: expected number`);
    }
    return;
  }

  fail(path, `cell.outputs[${idx}]: unsupported output_type '${t}'`);
}

function validateCell(cell, idx, path) {
  if (!isPlainObject(cell)) fail(path, `cells[${idx}]: expected object`);

  if (typeof cell.cell_type !== "string") fail(path, `cells[${idx}].cell_type: missing/invalid`);
  if (typeof cell.id !== "string") fail(path, `cells[${idx}].id: missing/invalid`);

  const baseAllowed = new Set(["id", "cell_type", "metadata", "source"]);
  if (!isPlainObject(cell.metadata)) fail(path, `cells[${idx}].metadata: expected object`);
  assertStringArray(cell.source, `cells[${idx}].source`, path);

  if (cell.cell_type === "markdown") {
    const allowed = new Set([...baseAllowed, "attachments"]);
    assertNoExtraKeys(cell, allowed, `markdown cell`, path);
    if (cell.attachments !== undefined) assertType(cell.attachments, "object", `cells[${idx}].attachments`, path);
    return;
  }

  if (cell.cell_type === "code") {
    const allowed = new Set([...baseAllowed, "outputs", "execution_count"]);
    assertNoExtraKeys(cell, allowed, `code cell`, path);
    if (!Array.isArray(cell.outputs)) fail(path, `cells[${idx}].outputs: expected array`);
    if (typeof cell.execution_count !== "number") {
      fail(path, `cells[${idx}].execution_count: expected number (not null)`);
    }
    for (let i = 0; i < cell.outputs.length; i++) {
      validateOutput(cell.outputs[i], i, path);
    }
    return;
  }

  if (cell.cell_type === "raw") {
    assertNoExtraKeys(cell, baseAllowed, `raw cell`, path);
    return;
  }

  fail(path, `cells[${idx}].cell_type: unsupported '${cell.cell_type}'`);
}

function validateNotebook(nb, path) {
  if (!isPlainObject(nb)) fail(path, `notebook: expected object`);

  const allowed = new Set(["nbformat", "nbformat_minor", "metadata", "cells"]);
  assertNoExtraKeys(nb, allowed, `root`, path);

  if (nb.nbformat !== 4) fail(path, `nbformat: expected 4`);
  if (typeof nb.nbformat_minor !== "number") fail(path, `nbformat_minor: expected number`);
  if (!isPlainObject(nb.metadata)) fail(path, `metadata: expected object`);
  if (!Array.isArray(nb.cells)) fail(path, `cells: expected array`);

  for (let i = 0; i < nb.cells.length; i++) validateCell(nb.cells[i], i, path);
}

function usageAndExit(code) {
  // eslint-disable-next-line no-console
  console.error("Usage: node scripts/check-nbformat-strict.js <file1.ipynb> [file2.ipynb ...]");
  process.exit(code);
}

function main() {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) usageAndExit(2);

  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    const nb = JSON.parse(raw);
    validateNotebook(nb, f);
  }

  // eslint-disable-next-line no-console
  console.log("✅ strict nbformat validation passed");
}

main();


