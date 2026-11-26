# Changelog

## 1.0.3 — 2026-11-26

Dark-theme fixes. The panel now follows DSH's light/dark theme instead of
falling back to a white surface with light text.

- Replaced the nonexistent `--dsw-alias-bg-l1/l2/l3` tokens with
  `--dsw-alias-bg-layer-1/2/3` and removed the light-only fallbacks.
- Primary buttons use `--dsw-alias-label-primary-inverted` for their label, so
  they stay readable when the brand color flips from near-black to near-white.
- Links, errors, warnings, the modal mask and input placeholders now use the
  matching theme tokens.
- Chart titles, axis labels, grid lines and axis rules follow the theme
  (`fill`/`stroke` overrides), so charts are readable on dark surfaces.
- Added dark-mode overrides for the amber session tag and the red error banner.

Screenshots were checked on the default light theme and on
`body[data-ds-dark-theme]`; no runtime or data behaviour changed.

## 1.0.2 — 2026-11-24

Screenshots refreshed on the default DSH theme with no third-party skin or
widgets, using a synthetic example dataset instead of a personal file. Added
`examples/regional-sales.csv` and `examples/README.md`. No runtime changes.

## 1.0.1 — 2026-11-24

Docs-only republish: final install links, npm/GitHub badges, the real repository
and jsDelivr URLs, storefront screenshots and the release checklist. No runtime
or manifest behaviour changed.

## 1.0.0 — 2026-11-24

First public release. `dsh-data-console` turns the conversation into a local
data workbench for DeepSeek Harness: open a file, understand it, query it,
chart it and export it, without uploading the data.

### Added

- **Composer panel** — a `数据` / `Data` button opens a console for the current
  session. The panel can be dragged, docks into a right sidebar near the right
  edge (or with the Dock button), resizes between 280 and 560 px, and remembers
  mode, position and width. In the desktop app it starts below the window title
  bar so the native window controls never cover its buttons.
- **Files** — CSV/TSV/TXT/XLSX/XLSM/JSON by path or through the OS file/folder
  dialogs, plus drag-and-drop import into a local content-addressed cache.
  Reopening the same path (and sheet) reuses one dataset.
- **Profile** — rows, columns, dtypes, missing values, unique counts,
  ranges/top values and in-memory size.
- **Table** — 50 rows per page, click-to-sort, and a SQL `WHERE` filter.
- **SQL** — the loaded table as `data`, every other open dataset as `ds<id>`,
  so multiple tables can be joined; results page in the panel.
- **Charts** — line, bar, scatter, histogram, box and heatmap, drawn as SVG and
  exportable as CSV or a 2× PNG.
- **Export** — CSV (UTF-8 with BOM) or XLSX for the table or a query result.
- **Agent tools** — `data_open`, `data_list`, `data_profile`, `data_query` and
  `data_export`, with bounded output.
- **Sessions, restore and recent** — per-session dataset ordering, automatic
  restore of open datasets after restart, and a 20-entry recent list.
- **Settings** — file-size and row limits, default chart type/aggregation and
  an optional Python path.
- **Resilience** — the Python sidecar may idle-exit; the Host reopens datasets
  under their existing ids on the next table/chart/SQL/export call.

### Verified

- 14 Python sidecar protocol tests.
- Route smoke checks for open, dedupe, meta, preview, filter, query, upload,
  settings and close.
- UI verification across profile, table, SQL, charts, export, settings,
  pickers, drag/drop, sidebar docking and idle sidecar recovery
  (see `VERIFICATION.md`).

### Known limits

- Datasets are held in memory; a restart clears the list (files are untouched).
- Legacy `.xls` is rejected; save it as `.xlsx`.
- SQL runs on an in-memory read-only SQLite copy, not the original file.
- Charts cap points per series; heatmaps and box plots cap groups.
- Python with `pandas` and `openpyxl` is required (the bundled DSH runtime is
  used when present).
