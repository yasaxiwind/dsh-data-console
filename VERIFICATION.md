# Data console — M1 verification

Date: 2026-11-24 · DSH 0.2.2-rc.5 (Desktop profile) · plugin 1.0.2

## Installed state

| Item | Value |
|---|---|
| Bundle | `dsh-data-console` (linked from this directory) |
| Row | `include:data-console` |
| Host fiber | active |
| Client bundle | loaded in the web page (`conversation.input.left` trigger + `shell.overlay` panel) |
| Python | `python` on PATH with pandas 3.0.1 (bundled `DSH_HOME/dsh-runtimes/.../python` is discovered first when no PATH interpreter has pandas) |

## Verified flows

### Host routes (authenticated HTTP, minted browser cookie)

| Route | Result |
|---|---|
| `GET /api/data-console/meta` | `ok`, base dir, python, limits, dataset list |
| `POST /api/data-console/open` (CSV) | 5,000 × 5, profile with datetime/float/str columns |
| `POST /api/data-console/open` (XLSX) | 5 × 4, sheet `Sheet1`, Chinese headers |
| `GET /api/data-console/profile?id=…` | profile JSON |
| `GET /api/data-console/preview?id=…&offset=0&limit=3` | 3 rows, `total` 5000 |
| `POST /api/data-console/query` (GROUP BY) | 4 rows, `A1 1285 / A2 1277 / B1 1238 / B2 1200`, 0–2 ms |
| `POST /api/data-console/query` (bad SQL) | 500 `{ ok:false, error:{ code:'OperationalError', message:'no such column: nope' } }` |
| `POST /api/data-console/close` | dataset removed |

### Agent tools (verified through a child agent)

`data_open`, `data_list`, `data_profile`, `data_query` all registered and callable. Row count, channel counts and averages are consistent (counts sum to 5,000). The bad-SQL path returns a one-line readable error instead of a crash.

### Panel (web GUI, Playwright)

- composer trigger **数据** opens the overlay; Escape and backdrop click close it;
- open CSV by path → profile cards + column table;
- open XLSX → Chinese headers, `物料` stays text (`M1/M2`), `单价` float, `数量` int;
- table tab → 100 pages of 50 rows, previous/next work;
- SQL tab → `SELECT * FROM data LIMIT 50` runs, result grid and `50 行 · 0 ms` pill;
- dedupe: opening the same path and sheet twice keeps one row;
- delete `×` removes the dataset and returns to the empty state;
- a missing path shows a red `file not found: <path>` under the input;
- status line is a neutral note: `已打开 quote.xlsx · 5 行`.

Screenshots: `browser-screenshots/dc-03-panel.png`, `dc-04-profile.png`, `dc-05-table.png`, `dc-06-sql.png`, `dc-10-final-excel.png`, `dc-11-error.png`, `dc-12-status.png`, `dc-13-deleted.png`.

## M2 additions (0.2.0) — verified

| Flow | Evidence |
|---|---|
| Table header sorting | clicking `值` / `value` shows `▲` and ascending values (4.167 …); a second click shows `▼` descending; a third clears the sort. The request carries `sort=<column>&dir=desc\|asc`. |
| SQL result paging | `SELECT * FROM data LIMIT 150` reports `150 行`, `第 1 / 3 页`, previous/next enabled as expected. |
| Folder picker | `浏览…` opens the last folder (the test folder after the first open); `↑` goes to the parent; directories list first, supported files show sizes; picking `quote.xlsx` opened it and closed the picker. |
| Session ownership (routes) | open with `sessionId=session-A` → `ownerSessionId=session-A`; `meta?sessionId=session-A` orders A's dataset first and B's second (and the reverse for B); an implicit `data_query` for A returned 5,000 rows, for B 5 rows; with two datasets and no session it returns `several datasets are open (ds1, ds2); pass the dataset id`. |
| Session tag (panel) | a dataset opened by a child agent's session appears with the orange **其他会话** tag when the panel is opened from a different real session. |

Screenshots: `browser-screenshots/dc-20-browser.png`, `dc-22-sort-asc.png`, `dc-23-sql-page.png`, `dc-26-owner.png`.

## M3 additions (0.3.0) — verified

| Flow | Evidence |
|---|---|
| Line chart | `sensor.csv` defaults to `channel × mean(value)` over 5,000 rows; SVG line, title `mean(value) · channel`, legend `value`. |
| Bar chart | same data rendered as bars from a zero baseline. |
| Box plot | `value` by `channel`: four boxes with whiskers, quartile box and median line. |
| Heatmap | `quote.xlsx`: `供应商` rows × `物料` columns, `mean(单价)` = 12.5 / 11.8 / 13 / 7.2 / 6.9 with the missing pair left blank. |
| Histogram | adapts bins to the row count (5 rows → 3 bins instead of 20). |
| CSV export | `scratch/data-console-test/sensor-bar-20261123-210843.csv` — `series,x,y` with the four channel means. |
| PNG export | `scratch/data-console-test/sensor-bar-20261123-210919.png` — 1520×760, 40 KB, white background, labels and legend intact. |
| `data_export` tool | child agent opened `sensor.csv`, exported a `GROUP BY` query to CSV and read it back (`channel,n` rows: A1/A2/B1/B2). |

Screenshots: `browser-screenshots/dc-30-chart-line.png`, `dc-31-chart-default.png`, `dc-32-chart-bar.png`, `dc-33-export-csv.png`, `dc-34-chart-box.png`, `dc-35-chart-heatmap.png`.

## M4 additions (0.4.0) — verified

| Flow | Evidence |
|---|---|
| Settings page | gear button opens ⚙ settings with file limit, row limit, default chart type/aggregation and Python path; saving writes `<USERPROFILE>\.dsh\data-console\settings.json`. |
| Persistence | after a plugin restart the settings view still reads `256` / `5000000` / `line` / `mean` from disk. |
| Row limit | with `maxRows=100`, opening the 5,000-row `sensor.csv` loaded `100 行 × 5 列`, showed the **文件超过行数上限，只读取了前 100 行。** note, and a `4 KB` memory card; the dataset header shows 100 rows. |
| Chart defaults | with `defaultChartType=bar` / `defaultAgg=sum`, a newly opened dataset's chart tab started at `bar` / `sum`; reverting the settings restored `line` / `mean`. |
| Settings file location | first attempt wrote to `<USERPROFILE>\data-console` (missing DSH_HOME); fixed with `DSH_HOME` → profile dir → `~/.dsh` fallback and re-verified under `.dsh`. |
| i18n audit | 81 dictionary keys in each locale; a script compared every `t('...')` call with both dictionaries and found no missing key (the four apparent extras were `getContext('2d')`, `createElement('canvas')`, `set('dir')`, `set('sort')` false positives). |
| Publish-ready detail | `meta.description` expanded, `docs/DETAIL.md` / `DETAIL.zh.md` reduced to one image line each pointing at the text-free `docs/preview.svg` (640×300); the Chinese detail page renders the description and preview with no diagnostic. English detail rendering was inferred from the declared files, not opened in an English UI. |
| Tool + typed checks | `index.js`, `client.js`, `sidecar.py` compile/parse clean; invalid settings (out-of-range values) are dropped by `normalizeSettings` instead of breaking startup. |

Screenshots: `browser-screenshots/dc-40-settings.png`, `dc-41-truncated.png`, `dc-42-truncated-profile.png`, `dc-43-preview.png`, `dc-45-details.png`.

## M5 additions (0.5.0) — verified

| Flow | Evidence |
|---|---|
| Multi-table SQL | with `quote.xlsx` selected and `sensor.csv` open, the SQL tab lists `可用表: 主表 data, ds1`; `select count(*) c from data cross join ds1` returns `25000` (5 × 5,000). |
| Read-only SQL | sidecar probe `delete from ds2` returns `SQL error: attempt to write a readonly database`; `PRAGMA query_only` is set on every mirror. |
| Multi-table export | `select q.供应商 s, q.物料 m from ds2 q order by q.供应商` exported to `scratch/data-console-test/join-export.csv` (5 rows, header `s,m`). |
| Table filter | `value > 80` on `sensor.csv` → **筛选后 40 行**, pill `40 行`, page `1 / 1`, every visible value above 80; sorting by `value` keeps the filter (80.263, 80.485, 80.507 with `▲`); **清除** restores `5,000 行` and empties the input. |
| Filter errors | an unknown column (`nope > 1`) returns `filter error: no such column: nope` in the panel instead of an empty table. |
| `data_query` over multiple tables | child agent opened both files, queried `ds1 cross join ds2` through the tool and got the same 25,000 count; `delete` through the tool was rejected by the read-only mirror. |
| Dataset reuse (fix) | a child agent's second `data_open` of `quote.xlsx` first produced a duplicate `ds3`: absolute paths kept their slash style (`D:/…` vs `D:\…`) and Excel records stored the resolved sheet name (`Sheet1`) while the request had none. `resolvePath` now always normalizes, dedupe compares the requested sheet, and re-opening from another session reuses `ds1`/`ds2` (route test: only two datasets remain). |

Screenshots: `browser-screenshots/dc-50-tables.png`, `dc-51-join.png`, `dc-52-filter.png`.

## M6 additions (0.6.0) — verified

| Flow | Evidence |
|---|---|
| Sidecar test suite | `python py/test_sidecar.py` → **13 tests, OK** in ~5 s: ping; open/profile dtypes (`M1/M2` stay strings, missing count); Excel sheet + Chinese columns; preview paging/sorting; filter + sort; filter error; aggregate + SQL error; multi-table join (`200 × 3 = 600`); read-only delete; bar/box/histogram/heatmap charts (incl. adaptive bins); CSV + XLSX export; `maxRows` truncation; GB18030; unknown dataset. |
| Route smoke test | `node test/routes-smoke.mjs` → **8/8 assertions**: open, re-open dedupes, meta lists the dataset and effective settings, preview paging, preview filter (`a > 1` → 2 rows), aggregate query, settings GET, close. Skips cleanly when the Host is unreachable or no credentials exist. |
| Chart legend toggle | line chart `value` by `channel` over `time` shows four series (A1/A2/B1/B2); clicking **A1** dims that legend entry and removes its polyline (4 → 3 lines) while the y-axis rescales; **显示全部** restores four lines and disappears. |
| Hover values | every circle, bar and heatmap cell carries an SVG `<title>` with `series · x → y`, so the native tooltip shows the exact point. |
| Heatmap determinism | rows/columns are ordered by cell count, then label (previously by summed values), so the test expects `["A", "B"]` and the render is stable. |
| Test entry points | `npm run test:syntax`, `test:sidecar`, `test:routes`; `npm test` runs syntax + sidecar. |

Screenshots: `browser-screenshots/dc-60-legend.png`, `dc-61-hidden.png`.

## M7 additions (0.7.0) — verified

| Flow | Evidence |
|---|---|
| Bookkeeping file | opening `sensor.csv` + `quote.xlsx` from session `persist` wrote `<USERPROFILE>\.dsh\data-console\datasets.json` with both paths, `requestedSheet: null`, owner and timestamp under `open`, plus the two `recent` entries. |
| Restore after restart | toggling the plugin off/on reopened both in the background; `meta` then listed `ds1:quote.xlsx:persist` and `ds2:sensor.csv:persist` (ids reassigned, owner preserved). |
| Close vs recent | closing all datasets emptied `open` while `recent` kept both entries; the file was rewritten each time. |
| Recent sidebar | the panel showed **最近打开** with `quote.xlsx` / `sensor.csv` and `MM-DD HH:mm` stamps even with no dataset open; clicking `sensor.csv` opened it (5,000 rows, 206 KB memory). |
| Clear recent | the **清空** link removed the block and left `"recent": []` on disk. |
| Key collision fix | the new "missing file" label shared the `missing` key used by the profile header and replaced **缺失** with **文件不存在**; renamed to `fileMissing`, re-verified header `缺失`. |
| Route test note | a live GUI tab can invalidate the minted cookie mid-run (one 401 at query); with the tab closed the smoke test is 8/8. Documented in the test header and README. |

Screenshots: `browser-screenshots/dc-70-recent.png`, `dc-71-recent-open.png`.

## M8 additions (0.8.0) — verified

| Flow | Evidence |
|---|---|
| Folder picker | the panel now shows **选择文件夹** / **选择文件**; a simulated `webkitdirectory` change with `webkitRelativePath = proj/sub/data.csv` listed **文件夹: proj** → `sub/data.csv 37 B` in the sidebar, and clicking it uploaded and opened `data.csv` (2 × 2, 184 B memory). |
| Drag and drop | dispatching `dragover` + `drop` with a `File` on `.dc-panel` imported `dragged.csv` (3 × 2) with **已导入 dragged.csv**; no `dragged.csv` text appeared outside the panel, so the composer did not attach it. |
| Upload route | `node test/routes-smoke.mjs` → **10/10**: upload opens under its original name, identical bytes dedupe to the same dataset id, close removes it. |
| Cache | copies live under `$DSH_HOME/data-console/cache/<content-hash>/<name>`; identical bytes reuse the file (mtime stable) and therefore the open dataset; folders untouched for 7 days are pruned at plugin start. |
| Limits | the Host rejects uploads above `min(maxFileMB, 100 MB)` and the client checks the same cap before sending. |

Screenshots: `browser-screenshots/dc-80-pickers.png`, `dc-81-folder.png`, `dc-82-folder-open.png`, `dc-83-drop.png`.

## M8.1 fix (0.8.1) — verified

| Problem | Fix and evidence |
|---|---|
| Dropping a file onto the panel showed DSH's attachment overlay (**文件或图片拖动到此处即可添加**) and the client stayed there, blocking further use. The panel only intercepted `dragover`/`drop` on document capture; DSH's `dragenter` still set its overlay, and swallowing the drop meant its `reset` never ran. | Drag events are now captured on `window` for `dragenter`/`dragover`/`dragleave`/`drop` while the panel is open; events inside the panel are stopped and, on entry, an **empty synthetic drop** (`types: ['Files']`, no files) is sent to DSH so its own handler resets the overlay without attaching anything. |
| Verification | In the running Web client: a dragenter outside the panel produced the overlay (`.mwbuSa_mask` = 1); a dragenter on the panel removed it (0); a drop on the panel imported `overlay-test.csv` and the table tab stayed clickable; the overlay did not return. |

Screenshot: `browser-screenshots/dc-91-drag-fixed.png`.

## M9 additions (0.9.0) — verified

| Flow | Evidence |
|---|---|
| Dock button | **侧栏** switched the panel to `dc-panel dc-sidebar` (fixed right, 382 px wide incl. border), set `margin-right: 380px` on `[class*="_centerCol"]`, hid the dataset list and showed the compact toolbar (dataset select, **＋** file, **📁** folder); the backdrop became pass-through so the chat stayed interactive. |
| Drag to move | synthetic pointer drag on the header moved a centered dialog to `x=8, y=86` and persisted `{mode:"dialog",x:8,y:86,width:380}` in `localStorage`. |
| Drag to dock | dragging to `clientX=1260` and releasing switched to `dc-sidebar` with `margin-right: 380px` and stored `mode:"sidebar"`. |
| Drag to undock | dragging the sidebar header left past 90 px returned it to `dc-floating`, cleared the margin, and stored `mode:"dialog"`; the clamp effect kept the wider dialog fully on screen (`x=90`). |
| Resize handle | dragging the left edge from 380 → 440 → 280 updated the panel width, the conversation margin and the stored width; at 282 px the container query hid the title so the header buttons still fit. |
| Persistence | after a page reload the panel reopened docked at the stored 440 px width with the chat margin applied; clearing the key returned it to a centered dialog. |
| Layout in sidebar | profile cards became a 2 × 2 grid, tables scroll horizontally, tabs stay on one row; under 900 px the sidebar becomes a full-width drawer. |

Screenshots: `browser-screenshots/dc-100-sidebar.png`, `dc-101-sidebar-wide.png`.

## M9.1 fix (0.9.1) — verified

| Problem | Fix and evidence |
|---|---|
| In the desktop app the docked sidebar started at the very top, so its **浮窗 / ⚙ / 刷新** buttons sat under the native minimize/maximize/close controls (and in the window drag strip), and **浮窗** could not be clicked. | The panel now reads the desktop title-bar height from `[data-windows-titlebar]` + `--dsh-windows-titlebar-height` (falling back to the Window Controls Overlay rect, then 42 px) and offsets the docked sidebar by it; floating dialogs are clamped to `inset + 8` and the backdrop reserves the strip. `-webkit-app-region: no-drag` is set across the panel. |
| Verification | with the desktop attributes simulated (`data-windows-titlebar`, height 42): sidebar rect `[898, 42, 382, 758]`, header at `43–92`, buttons at `y=53` (clear of the 0–42 control strip); `elementFromPoint` on **浮窗** returned the button itself and the click toggled to floating; dragging the dialog upward clamped at `y=50` (42 + 8); on plain web the inset is 0 and the dialog stays centered. The attribute was also detected when set on `#root`, not just `<html>`/`<body>`. |

Screenshot: `browser-screenshots/dc-110-sidebar-inset.png`.

## M9.2 fix (0.9.2) — verified

| Problem | Cause and fix |
|---|---|
| After the app sat idle for a while, clicking **表格** or **图表** showed *先打开一个 CSV / Excel 文件*, with status `'unknown dataset'`, although the profile still displayed. | The Python sidecar exits after 10 minutes idle, but the Host kept the dataset records. Profiles come from the Host cache, so they still worked; table/chart/SQL requests hit a fresh sidecar that never heard of those dataset ids. The Sidecar now counts generations (spawn / exit / dispose), each record stores the generation it was loaded in, and `ensureDatasetLive` / `ensureAllDatasetsLive` call a new `reopen` operation that re-registers a dataset **under its existing id** before preview, chart, query, export, column-scoped profile and the agent tools. A failed reopen is logged and does not block queries over other datasets. |
| Verification | killed the live sidecar process (PID 4060) while the table was open, then clicked the **年份** header: the Host respawned the sidecar, reopened `ds` under the same id and the table reloaded 16 rows with `年份▲`; the same test passed for **生成** (chart) and **运行** (SQL, `16 行 · 0 ms`). `py/test_sidecar.py` now covers `reopen` (same id, 200 rows, preview works): **14/14 OK**. |









## Limits and notes (0.9.0)

- Dataset registry is in memory; `datasets.json` reopens up to 8 previously open files and lists 20 recent ones, skipping missing paths (logged, never fatal).
- Tuning lives in `$DSH_HOME/data-console/settings.json` (file size, row limit, default chart type/aggregation, Python path); invalid values fall back to defaults.
- Defaults: 256 MB per file and 5,000,000 loaded rows. CSV/TSV/TXT are chunk-read and stop at the row cap; Excel/JSON are read whole and then truncated; both set a `truncated` flag shown in the panel as **文件超过行数上限…**.
- The panel is a frame overlay, not a conversation tab.
- SQL results are fetched in full up to 200 rows and paged in the panel; the model-facing tool stays at 50 rows.
- Multi-table SQL builds one SQLite database per dataset set and caches up to two sets; every connection is `PRAGMA query_only = ON`.
- Table filters are SQL `WHERE` fragments on the host; they combine with sorting and paging but do not alter the profile or charts.
- Dropped/selected files are copied into `$DSH_HOME/data-console/cache` (100 MB cap) and opened from there; the cache is pruned at startup (7 days) and is not backed up.
- `.xls` (legacy) is rejected; save as `.xlsx`. Parquet needs `pyarrow` and is not advertised.
- Charts cap line/bar at 400 points per series, scatter at 1,500, heatmaps at 20×12, box plots at 12 groups; PNG export is fixed at 2×.
- Relative paths typed in the panel resolve against the last opened file's folder; the agent's relative paths resolve against the session working directory.
- The detail page declares an English and a Chinese one-image document (`docs/DETAIL.md`, `docs/DETAIL.zh.md`) sharing the text-free `docs/preview.svg`; only the Chinese rendering was opened in this session.

## Reload after changes

- `index.js` / `py/sidecar.py`: toggle the plugin row (Plugins → 数据工作台) off and on, or restart DSH.
- `client.js`: reload the page (web) or the Desktop window (Ctrl+R); the Desktop app otherwise keeps the previous client generation.

## Release readiness (1.0.0) — verified

| Item | Result |
|---|---|
| Package identity | `dsh-data-console` 1.0.0, MIT, `engines.dsh >= 0.2.2-rc.5`, `publishConfig.access public`. |
| Static gate | `npm run verify:package` → **72 checks passed** (name, semver, license, exports, bundle patch, locales, detail documents, icon size, required files, no test/pycache, sidecar capabilities). |
| Tarball | `npm pack` → `dsh-data-console-1.0.0.tgz` (69 KB, 19 files): `index.js`, `client.js`, `py/sidecar.py`, `cordis.patch.yml`, `locale/*.json`, `docs/*`, `icon.svg`, `README.md`, `LICENSE`, `CHANGELOG.md`; **no** tests, `__pycache__` or scratch files. |
| Clean-profile install | `dsh plugin --profile release-test add ./dsh-data-console-1.0.0.tgz` reported `+ dsh-data-console 1.0.0`; the profile manifest lists the dependency and the `dsh.profile.bundles` entry, and `--dump-config` shows `- id: data-console` / `name: dsh-data-console`. |
| Market index | `market/index.json` generated by `npm run market:build` and validated with DSH's own `parseMarketIndex` from `@deepseek-ai/dsh-plugin-market-index`: `format: 1`, localized title/description, inline SVG icon (782 chars), category/labels, `version 1.0.0`, `engines.dsh`. |
| Live profile | Re-installed as the linked bundle `dsh-data-console` 1.0.0 (row `include:data-console`); the previous `@local/dsh-data-console` link was removed. |
| CI | `.github/workflows/ci.yml` (syntax + sidecar + verify + pack on push/PR) and `.github/workflows/release.yml` (tag `v*` → `npm publish --provenance`). |
| Docs | README has npm/tarball/local install and distribution channels; DETAIL.md / DETAIL.zh.md expanded; CHANGELOG, RELEASE checklist, SECURITY and LICENSE added. |

### Published artifacts (2026-11-24)

| Item | Result |
|---|---|
| npm | `dsh-data-console@1.0.0` published; registry `dist-tags.latest = 1.0.0`, tarball SHA-1 `857e440568ddbeb1ab242aab7bc95ea61a1cc1de` (69,087 bytes). |
| npm install | `dsh plugin --profile npm-test add dsh-data-console@1.0.0` → `+ dsh-data-console 1.0.0`, 19 files installed, composition valid. |
| GitHub | https://github.com/yasaxiwind/dsh-data-console — `main` pushed, tag `v1.0.0`, Release with `dsh-data-console-1.0.0.tgz` asset (same SHA-1). |
| CI / release workflow | `CI` success on push; `Release` workflow success and skipped publishing because `npm view` already reported `1.0.0`. |
| Storefront assets | `screenshots.json` + three JPEG screenshots under `docs/screenshots/` (sidebar, table filter, chart). |
