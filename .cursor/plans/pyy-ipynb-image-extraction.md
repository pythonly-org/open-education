# PYY → IPYNB mirroring with GitHub-safe image extraction

## Goal
Keep `.pyy` as the **source of truth**, and generate `.ipynb` mirrors that:
- Render correctly on GitHub
- Pass strict structural validation
- Do **not** rely on inline `data:image/...;base64,...` images (GitHub often fails to render them)

## What gets converted/extracted
- **Notebook structure fixes**: remove Pythonly-only fields (e.g. `pyyFormat`, `codeCellIndex`), normalize `cell.source` to `string[]`, ensure valid `execution_count`, etc.
- **Images**:
  - **Markdown cells**: `<img src="data:image/...;base64,...">` and `![](data:image/...;base64,...)` are extracted into files and rewritten as links.
  - **Outputs** (`display_data` / `execute_result`):
    - Any `data:image/...;base64,...` in `text/html` / `text/markdown` is extracted + rewritten.
    - Any `output.data["image/*"]` payload stored as a data-URI is extracted and converted into `output.data["text/html"] = "<img src=...>"` (and the `image/*` key is removed) so GitHub reliably shows the image.

## Image folder strategy (per-notebook)
Images are written next to the notebook in a deterministic folder:

- **images folder**: `<notebook>.images/`
  - Example: `curricula/data-science/Datasets.ipynb` → `curricula/data-science/Datasets.images/<sha256>.<ext>`
- Files are **content-hashed**, so regeneration is deterministic and de-duplicates within that notebook.
- The folder is **fully regenerated** on each conversion, so stale images are removed naturally.

## Automation (Husky pre-commit)
On commit:
1. Detect staged `*.pyy` files
2. Convert each staged `.pyy` → `.ipynb` (and extract images)
3. `git add` the generated `.ipynb` and its `<notebook>.images/` folder (including deletions)
4. Run strict validation on the generated `.ipynb`

## Useful commands
- **Sync everything**: `npm run notebooks:sync`
  - Regenerates all `curricula/**/*.ipynb` mirrors (and their `.images/` folders), then validates.
- **Validate only**: `npm run notebooks:check`


