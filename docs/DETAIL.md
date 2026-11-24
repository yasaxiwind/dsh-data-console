![Data console: a dataset list, column profile cards, a sortable table and a bar chart](preview.svg)

# Data console

A local data workbench inside DeepSeek Harness. Open a CSV, Excel or JSON file
from the conversation and understand it without leaving the chat; the file is
read on your machine and never uploaded.

## What it does

- **Open** by path, through the OS file/folder dialogs, or by dropping a file on
  the panel. Imported files are copied to a local cache so the Python sidecar
  gets a real path.
- **Profile** every column: type, missing values, unique counts, ranges or top
  values, plus the in-memory size of the frame.
- **Browse** the table 50 rows at a time, sort by any column and filter it with
  a SQL `WHERE` expression.
- **Query** with SQL: the selected dataset is `data`, every other open dataset
  is `ds<id>`, so several tables can be joined in one statement.
- **Chart** six types (line, bar, scatter, histogram, box, heatmap) and export
  the chart as CSV or a 2× PNG.
- **Export** the table or a query result as CSV (UTF-8 with BOM) or XLSX.
- **Dock** the panel: drag its header, release near the right edge to turn it
  into a sidebar that shrinks the conversation, resize it from its left edge and
  drag it out again. The layout is remembered.

## Using it

1. Click **数据** / **Data** in the composer.
2. Open a file — the profile appears immediately.
3. Switch to **表格** / **Table**, **SQL** or **图表** / **Chart**; the same
   dataset stays selected.
4. Ask the agent to query the data; it sees the same open datasets through the
   tools below.

## Agent tools

| Tool | Purpose |
|---|---|
| `data_open` | Load a file and return its profile |
| `data_list` | List open datasets |
| `data_profile` | Column profile, optionally for a subset of columns |
| `data_query` | Read-only SQL over `data` and `ds<id>`; at most 50 rows |
| `data_export` | Write the table or a query result to CSV/XLSX |

## Requirements and limits

- Python with `pandas` and `openpyxl`; DSH's bundled runtime is used when
  present.
- DSH 0.2.2-rc.5 or newer.
- Datasets live in memory: a restart clears the list, not the files.
- Default limits: 256 MB per file and 5,000,000 loaded rows, both configurable
  in the panel's settings. Legacy `.xls` must be saved as `.xlsx`.
- SQL runs on an in-memory, read-only SQLite copy; the source file is never
  modified.
- The sidecar exits after 10 minutes idle; the next table, chart, SQL or export
  call reopens the dataset transparently.

## Privacy

No telemetry and no upload path. Files are read locally by the sidecar, and the
panel's routes are authenticated same-origin Host routes.
