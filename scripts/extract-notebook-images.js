import fs from "fs";
import path from "path";
import crypto from "crypto";

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

function mimeToExt(mime) {
  const m = (mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/jpeg") return "jpg";
  if (m === "image/jpg") return "jpg";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "image/svg+xml") return "svg";
  return "bin";
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function removeDirIfExists(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function pathRelativeFromNotebookDir(notebookPath, targetPath) {
  const rel = path.relative(path.dirname(notebookPath), targetPath);
  // Notebook URLs want forward slashes even on Windows.
  return rel.split(path.sep).join("/");
}

function replaceDataUriImagesInText(text, notebookAbsPath, writeImage) {
  let out = text;

  // HTML img src="data:image/...;base64,...." (double quotes)
  out = out.replaceAll(/src="data:(image\/[^;]+);base64,([^"]+)"/g, (_m, mime, b64) => {
    const absWritten = writeImage(mime, b64);
    const rel = pathRelativeFromNotebookDir(notebookAbsPath, absWritten);
    return `src="${rel}"`;
  });

  // HTML img src='data:image/...;base64,....' (single quotes)
  out = out.replaceAll(/src='data:(image\/[^;]+);base64,([^']+)'/g, (_m, mime, b64) => {
    const absWritten = writeImage(mime, b64);
    const rel = pathRelativeFromNotebookDir(notebookAbsPath, absWritten);
    return `src='${rel}'`;
  });

  // Markdown image: ![](data:image/...;base64,...)
  out = out.replaceAll(/!\[[^\]]*]\(data:(image\/[^;]+);base64,([^)]+)\)/g, (_m, mime, b64) => {
    const absWritten = writeImage(mime, b64);
    const rel = pathRelativeFromNotebookDir(notebookAbsPath, absWritten);
    return `![](${rel})`;
  });

  return out;
}

/**
 * Extract data-URI / base64 images into a per-notebook `<notebook>.images/` folder and
 * rewrite the notebook to reference those images via relative paths.
 *
 * - `notebookAbsPath` must be the absolute path of the target `.ipynb`.
 */
export function extractNotebookImagesAndRewrite(nb, notebookAbsPath) {
  const imagesDirAbs = notebookAbsPath.replace(/\.ipynb$/i, ".images");
  removeDirIfExists(imagesDirAbs);
  ensureDir(imagesDirAbs);

  const writeImage = (mime, b64) => {
    const buf = Buffer.from(String(b64), "base64");
    const hash = sha256Hex(buf);
    const ext = mimeToExt(mime);
    const targetAbs = path.join(imagesDirAbs, `${hash}.${ext}`);
    if (!fs.existsSync(targetAbs)) {
      fs.writeFileSync(targetAbs, buf);
    }
    return targetAbs;
  };

  const next = { ...nb };
  next.cells = (nb.cells ?? []).map((cell) => {
    const c = { ...cell };

    // Rewrite markdown and code cell source (both can contain HTML).
    if (Array.isArray(c.source)) {
      const joined = c.source.join("");
      const rewritten = replaceDataUriImagesInText(joined, notebookAbsPath, writeImage);
      c.source = toLineArray(rewritten);
    }

    // Rewrite outputs HTML/text payloads where we may have embedded data URIs.
    if (c.cell_type === "code" && Array.isArray(c.outputs)) {
      c.outputs = c.outputs.map((o) => {
        if (!o || typeof o !== "object") return o;
        const oo = { ...o };

        // stream.text can include HTML (rare, but safe)
        if (oo.output_type === "stream" && Array.isArray(oo.text)) {
          const joined = oo.text.join("");
          const rewritten = replaceDataUriImagesInText(joined, notebookAbsPath, writeImage);
          oo.text = toLineArray(rewritten);
        }

        if (oo.output_type === "display_data" || oo.output_type === "execute_result") {
          if (oo.data && typeof oo.data === "object" && !Array.isArray(oo.data)) {
            // Extract any image/* payloads into files and convert to text/html <img src="...">.
            // Some sources store image payloads as data URIs ("data:image/png;base64,...").
            for (const [mime, val] of Object.entries(oo.data)) {
              if (!mime.toLowerCase().startsWith("image/")) continue;
              if (val == null) continue;

              const raw = Array.isArray(val) ? val.join("") : String(val);
              const m = raw.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
              const imgMime = m?.[1] ?? mime;
              const b64 = m?.[2] ?? raw;

              const absWritten = writeImage(imgMime, b64);
              const rel = pathRelativeFromNotebookDir(notebookAbsPath, absWritten);
              const imgHtml = `<img src="${rel}" />`;

              if (typeof oo.data["text/html"] === "string") {
                oo.data["text/html"] += imgHtml;
              } else if (Array.isArray(oo.data["text/html"])) {
                oo.data["text/html"] = toLineArray(oo.data["text/html"].join("") + imgHtml);
              } else {
                oo.data["text/html"] = imgHtml;
              }

              delete oo.data[mime];
            }

            // text/html
            if (typeof oo.data["text/html"] === "string") {
              oo.data["text/html"] = replaceDataUriImagesInText(oo.data["text/html"], notebookAbsPath, writeImage);
            } else if (Array.isArray(oo.data["text/html"])) {
              const joined = oo.data["text/html"].join("");
              const rewritten = replaceDataUriImagesInText(joined, notebookAbsPath, writeImage);
              oo.data["text/html"] = toLineArray(rewritten);
            }

            // text/markdown
            if (typeof oo.data["text/markdown"] === "string") {
              oo.data["text/markdown"] = replaceDataUriImagesInText(
                oo.data["text/markdown"],
                notebookAbsPath,
                writeImage,
              );
            } else if (Array.isArray(oo.data["text/markdown"])) {
              const joined = oo.data["text/markdown"].join("");
              const rewritten = replaceDataUriImagesInText(joined, notebookAbsPath, writeImage);
              oo.data["text/markdown"] = toLineArray(rewritten);
            }
          }
        }

        return oo;
      });
    }

    return c;
  });

  // If the folder ended up empty, remove it to avoid clutter.
  const remaining = fs.readdirSync(imagesDirAbs);
  if (remaining.length === 0) {
    removeDirIfExists(imagesDirAbs);
  }

  return next;
}


