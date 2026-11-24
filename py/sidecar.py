#!/usr/bin/env python3
"""Data console sidecar.

Reads one JSON request per line from stdin and writes one JSON response per
line to stdout. Requests run sequentially in this process; the Host half
serializes them. The process exits when stdin closes (the Host process is
gone), so no orphan can survive a hard kill of DSH.

Ops:
  ping
  open     { path, sheet? }
  profile  { dataset, columns? }
  preview  { dataset, offset?, limit?, sort?, desc? }
  query    { dataset, sql, limit? }
  close    { dataset }
"""

from __future__ import annotations

import csv
import json
import math
import os
import re
import sqlite3
import sys
import time
import traceback
import warnings

import pandas as pd

MAX_CELL = 200
MAX_ROWS = 200
MAX_PROFILE_UNIQUE_ROWS = 2_000_000


class Dataset:
    """One loaded table plus its lazily built SQLite mirror."""

    def __init__(self, ds_id: str, path: str, frame: pd.DataFrame, sheet, truncated: bool):
        self.id = ds_id
        self.path = path
        self.frame = frame
        self.sheet = sheet
        self.truncated = truncated
        self.conn = None
        self.table_ready = False


DATASETS: dict[str, Dataset] = {}
COUNTER = 0


def to_py(value):
    """Convert one pandas/numpy cell into a JSON-safe value."""
    if value is None:
        return None
    try:
        if isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return None
            return value
        if isinstance(value, (bool, int, str)):
            return value[:MAX_CELL] if isinstance(value, str) else value
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if isinstance(value, bytes):
            return f"<{len(value)} bytes>"
        # numpy scalars and everything else
        text = str(value)
        return text[:MAX_CELL]
    except Exception:
        return "<unprintable>"


DATE_HINT = re.compile(
    r"^\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}"
    r"(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\s*$"
)


def coerce_datetimes(frame: pd.DataFrame) -> pd.DataFrame:
    """Turn ISO-looking object columns into datetimes when a sample parses cleanly."""
    for name in list(frame.columns):
        series = frame[name]
        if not (getattr(series, "dtype", None) == object or pd.api.types.is_string_dtype(series)):
            continue
        sample = series.dropna().head(200)
        if len(sample) < 3:
            continue
        # Require a date-looking shape first: "M1"/"M2" parse as dates otherwise.
        if not all(DATE_HINT.match(str(value)) for value in sample):
            continue
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                parsed = pd.to_datetime(sample, errors="raise")
        except Exception:
            continue
        if len(parsed) < len(sample):
            continue
        years = parsed.dt.year
        if years.min() < 1900 or years.max() > 2200:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            frame[name] = pd.to_datetime(series, errors="coerce")
    return frame


def read_csv_limited(path: str, sep, encoding: str, max_rows: int):
    """Read a CSV in chunks, stopping at max_rows. Returns (frame, truncated)."""
    chunks = []
    total = 0
    truncated = False
    for chunk in pd.read_csv(path, sep=sep, encoding=encoding, low_memory=False, chunksize=200_000):
        if max_rows > 0 and total + len(chunk) > max_rows:
            chunks.append(chunk.iloc[: max_rows - total])
            total = max_rows
            truncated = True
            break
        chunks.append(chunk)
        total += len(chunk)
    frame = pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame()
    return frame, truncated


def read_frame(path: str, sheet, max_rows: int = 0):
    """Load a table from CSV/TSV/TXT, XLSX or JSON. Returns (frame, sheet, sheets, truncated)."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".csv", ".tsv", ".txt"):
        sep = "\t" if ext == ".tsv" else None
        if sep is None:
            with open(path, "rb") as handle:
                head = handle.read(8192)
            try:
                sep = csv.Sniffer().sniff(head.decode("utf-8", "ignore"), delimiters=",;\t|").delimiter
            except Exception:
                sep = ","
        failure = None
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                frame, truncated = read_csv_limited(path, sep, encoding, max_rows)
                return coerce_datetimes(frame), None, None, truncated
            except UnicodeDecodeError as error:
                failure = error
                continue
        raise ValueError(f"could not decode {os.path.basename(path)} as UTF-8 or GB18030: {failure}")
    if ext in (".xlsx", ".xlsm"):
        workbook = pd.ExcelFile(path, engine="openpyxl")
        names = list(workbook.sheet_names)
        if isinstance(sheet, str) and sheet in names:
            chosen = sheet
        elif isinstance(sheet, int) and 0 <= sheet < len(names):
            chosen = names[sheet]
        else:
            chosen = names[0] if names else None
        frame = pd.read_excel(workbook, sheet_name=chosen)
        truncated = bool(max_rows > 0 and len(frame) > max_rows)
        if truncated:
            frame = frame.iloc[:max_rows]
        return coerce_datetimes(frame), chosen, names, truncated
    if ext == ".json":
        frame = pd.read_json(path)
        truncated = bool(max_rows > 0 and len(frame) > max_rows)
        if truncated:
            frame = frame.iloc[:max_rows]
        return coerce_datetimes(frame), None, None, truncated
    if ext == ".xls":
        raise ValueError("legacy .xls is not supported; save the workbook as .xlsx first")
    raise ValueError(f"unsupported file type: {ext or '(none)'}")


def memory_bytes(frame: pd.DataFrame) -> int:
    """Approximate in-memory footprint; deep counting is skipped for very large frames."""
    if len(frame.columns) == 0:
        return 0
    try:
        deep = len(frame) <= 500_000
        return int(frame.memory_usage(deep=deep).sum())
    except Exception:
        return 0


def profile_of(frame: pd.DataFrame) -> dict:
    """Column-level profile for one frame."""
    columns = []
    rows = len(frame)
    for name in list(frame.columns):
        series = frame[name]
        item = {
            "name": str(name),
            "dtype": str(series.dtype),
            "missing": int(series.isna().sum()),
        }
        try:
            item["unique"] = int(series.nunique(dropna=True)) if rows <= MAX_PROFILE_UNIQUE_ROWS else None
        except Exception:
            item["unique"] = None
        if pd.api.types.is_numeric_dtype(series):
            clean = series.dropna()
            if len(clean) > 0:
                item["min"] = to_py(clean.min())
                item["max"] = to_py(clean.max())
                try:
                    item["mean"] = round(float(clean.mean()), 6)
                except Exception:
                    item["mean"] = None
        elif pd.api.types.is_datetime64_any_dtype(series):
            item["min"] = to_py(series.min())
            item["max"] = to_py(series.max())
        else:
            unique = item.get("unique")
            if unique is None or unique <= 50:
                try:
                    counts = series.value_counts(dropna=True).head(5)
                    item["top"] = [{"value": to_py(key), "count": int(count)} for key, count in counts.items()]
                except Exception:
                    pass
        columns.append(item)
    return {"rows": int(rows), "cols": int(len(frame.columns)), "columns": columns}


def preview_of(dataset: Dataset, offset: int, limit: int, sort, desc: bool, where=None) -> dict:
    where = (where or "").strip() if isinstance(where, str) else ""
    if not where:
        frame = dataset.frame
        if isinstance(sort, str) and sort in [str(name) for name in frame.columns]:
            column = next(name for name in frame.columns if str(name) == sort)
            frame = frame.sort_values(by=column, ascending=not desc, kind="mergesort")
        total = len(frame)
        offset = max(0, min(offset, total))
        part = frame.iloc[offset:offset + limit]
        columns = [str(name) for name in frame.columns]
        rows = [[to_py(value) for value in record] for record in part.itertuples(index=False, name=None)]
        return {"columns": columns, "rows": rows, "total": int(total), "offset": int(offset), "limit": int(limit)}
    connection = ensure_sqlite(dataset)
    names = unique_columns(dataset.frame)
    order = ""
    if isinstance(sort, str) and sort:
        index = next((i for i, name in enumerate(dataset.frame.columns) if str(name) == str(sort)), None)
        if index is not None:
            quoted = names[index].replace('"', '""')
            order = f' ORDER BY "{quoted}" {"DESC" if desc else "ASC"}'
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM data WHERE ({where})")
        total = int(cursor.fetchone()[0])
        offset = max(0, min(offset, total))
        cursor.execute(f"SELECT * FROM data WHERE ({where}){order} LIMIT ? OFFSET ?", (limit, offset))
        raw = cursor.fetchall()
    except sqlite3.Error as error:
        raise ValueError(f"filter error: {error}") from error
    columns = [str(name) for name in dataset.frame.columns]
    rows = [[to_py(value) for value in record] for record in raw]
    return {
        "columns": columns,
        "rows": rows,
        "total": total,
        "offset": int(offset),
        "limit": int(limit),
        "filtered": True,
    }


def sqlite_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Build a SQLite-bindable copy: unique names, datetimes as ISO text, JSON-safe cells."""
    names = []
    seen: dict[str, int] = {}
    for name in frame.columns:
        base = str(name) if str(name).strip() else "column"
        if base in seen:
            seen[base] += 1
            names.append(f"{base}_{seen[base]}")
        else:
            seen[base] = 0
            names.append(base)
    columns: dict[str, pd.Series] = {}
    for name, column_name in zip(frame.columns, names):
        series = frame[name]
        if pd.api.types.is_datetime64_any_dtype(series):
            columns[column_name] = series.dt.strftime("%Y-%m-%dT%H:%M:%S").where(series.notna(), None)
        elif pd.api.types.is_bool_dtype(series):
            columns[column_name] = series.map(lambda value: None if pd.isna(value) else int(value))
        elif pd.api.types.is_numeric_dtype(series):
            columns[column_name] = series
        else:
            columns[column_name] = series.map(
                lambda value: None if value is None else (
                    value if isinstance(value, (str, int, float, bool)) else str(value)
                )
            )
    return pd.DataFrame(columns)


def ensure_sqlite(dataset: Dataset):
    """Build (once) the in-memory SQLite mirror of one dataset."""
    if dataset.table_ready:
        return dataset.conn
    safe = sqlite_frame(dataset.frame)
    dataset.conn = sqlite3.connect(":memory:")
    try:
        safe.to_sql("data", dataset.conn, index=False, if_exists="replace", chunksize=10_000)
    except Exception as error:
        dataset.conn.close()
        dataset.conn = None
        raise RuntimeError(f"could not build the SQLite copy: {error}") from error
    dataset.conn.commit()
    dataset.table_ready = True
    try:
        dataset.conn.execute("PRAGMA query_only = ON")
    except sqlite3.Error:
        pass
    return dataset.conn


SHARED: dict[tuple, sqlite3.Connection] = {}


def shared_connection(dataset_ids: list[str]) -> sqlite3.Connection:
    """Build (and cache) one SQLite database with every listed dataset as a table."""
    primary = dataset_ids[0]
    key = (primary, *sorted(set(dataset_ids)))
    cached = SHARED.get(key)
    if cached is not None:
        return cached
    connection = sqlite3.connect(":memory:")
    try:
        for ds_id in [primary] + sorted(set(dataset_ids) - {primary}):
            dataset = DATASETS.get(ds_id)
            if dataset is None:
                raise KeyError(f"unknown dataset: {ds_id}")
            sqlite_frame(dataset.frame).to_sql(ds_id, connection, index=False, if_exists="replace", chunksize=10_000)
        connection.execute(f'CREATE VIEW data AS SELECT * FROM "{primary}"')
        connection.commit()
        connection.execute("PRAGMA query_only = ON")
    except Exception:
        connection.close()
        raise
    SHARED[key] = connection
    while len(SHARED) > 2:
        oldest = next(iter(SHARED))
        if oldest == key:
            break
        SHARED.pop(oldest).close()
    return connection


def drop_shared(dataset_id: str) -> None:
    """Close cached multi-table connections that include one dataset."""
    for key in [entry for entry in SHARED if dataset_id in entry]:
        try:
            SHARED.pop(key).close()
        except sqlite3.Error:
            pass


def connection_for(dataset_ids: list[str]) -> sqlite3.Connection:
    """Use the single-dataset mirror when possible, otherwise a shared database."""
    if len(dataset_ids) == 1:
        dataset = DATASETS.get(dataset_ids[0])
        if dataset is None:
            raise KeyError(f"unknown dataset: {dataset_ids[0]}")
        return ensure_sqlite(dataset)
    return shared_connection(dataset_ids)


def run_query(connection: sqlite3.Connection, sql: str, limit: int) -> dict:
    started = time.time()
    cursor = connection.cursor()
    try:
        cursor.execute(sql)
    except sqlite3.Error as error:
        raise ValueError(f"SQL error: {error}") from error
    if cursor.description is None:
        return {
            "columns": [],
            "rows": [],
            "rowCount": int(cursor.rowcount),
            "truncated": False,
            "ms": int((time.time() - started) * 1000),
            "message": "statement executed",
        }
    columns = [str(entry[0]) for entry in cursor.description]
    raw = cursor.fetchmany(limit + 1)
    truncated = len(raw) > limit
    rows = [[to_py(value) for value in record] for record in raw[:limit]]
    return {
        "columns": columns,
        "rows": rows,
        "rowCount": int(cursor.rowcount if cursor.rowcount >= 0 else len(raw)),
        "returned": len(rows),
        "truncated": truncated,
        "ms": int((time.time() - started) * 1000),
    }


def column_by_name(frame: pd.DataFrame, name):
    """Resolve a model/client column name against the frame's possibly non-string labels."""
    if name is None:
        return None
    for column in frame.columns:
        if str(column) == str(name):
            return column
    raise ValueError(f"unknown column: {name}")


def axis_value(value):
    """Convert one x value into a JSON axis value."""
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (int, float, bool)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    return str(value)[:80]


def _x_kind(series: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "time"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    return "category"


def _thinned(values: list, limit: int) -> tuple[list, bool]:
    if len(values) <= limit:
        return values, False
    step = max(1, math.ceil(len(values) / limit))
    return values[::step], True


def _grouped_chart(frame, kind, x_name, y_name, group_name, agg, max_points=400, max_categories=40):
    x_col = column_by_name(frame, x_name)
    y_col = column_by_name(frame, y_name)
    if x_col is None or y_col is None:
        raise ValueError("x and y columns are required")
    group_col = column_by_name(frame, group_name) if group_name else None
    x_type = _x_kind(frame[x_col])
    columns = [x_col, y_col] + ([group_col] if group_col is not None else [])
    subset = frame[columns].dropna(subset=[y_col])
    if len(subset) == 0:
        raise ValueError("no rows with both x and y present")
    keys = [x_col] + ([group_col] if group_col is not None else [])
    if agg == "count":
        grouped = subset.groupby(keys, dropna=False).size()
        grouped = grouped.rename("__value__").reset_index()
    else:
        grouped = subset.groupby(keys, dropna=False)[y_col].agg(agg).rename("__value__").reset_index()
    series = []
    groups = [(None, grouped)] if group_col is None else list(grouped.groupby(group_col, dropna=False))
    for group_value, part in groups:
        part = part.copy()
        if kind == "bar":
            part = part.sort_values("__value__", ascending=False, kind="mergesort").head(max_categories)
        elif x_type == "time":
            part = part.assign(__x__=pd.to_datetime(part[x_col], errors="coerce")).sort_values("__x__")
        else:
            part = part.sort_values(x_col, kind="mergesort")
        points = [
            {"x": axis_value(row[x_col]), "y": to_py(row["__value__"])}
            for _, row in part.iterrows()
        ]
        points, thinned = _thinned(points, max_points)
        series.append({
            "name": ("count" if agg == "count" else "value") if group_col is None else str(to_py(group_value)),
            "points": points,
            "truncated": thinned,
        })
    return {
        "kind": kind,
        "xType": x_type,
        "xLabel": str(x_col),
        "yLabel": f"{agg}({y_col})" if agg != "count" else f"count({y_col})",
        "series": series,
    }


def _scatter_chart(frame, x_name, y_name, group_name, max_points=1500):
    x_col = column_by_name(frame, x_name)
    y_col = column_by_name(frame, y_name)
    if x_col is None or y_col is None:
        raise ValueError("x and y columns are required")
    x_type = _x_kind(frame[x_col])
    if x_type == "category":
        raise ValueError("scatter needs numeric or date x and y columns")
    group_col = column_by_name(frame, group_name) if group_name else None
    columns = [x_col, y_col] + ([group_col] if group_col is not None else [])
    subset = frame[columns].dropna(subset=[x_col, y_col])
    if len(subset) > max_points:
        subset = subset.sample(n=max_points, random_state=0)
    series = []
    groups = [(None, subset)] if group_col is None else list(subset.groupby(group_col, dropna=False))
    for group_value, part in groups:
        points = [{"x": axis_value(row[x_col]), "y": to_py(row[y_col])} for _, row in part.iterrows()]
        series.append({"name": "points" if group_col is None else str(to_py(group_value)), "points": points})
    return {
        "kind": "scatter",
        "xType": x_type,
        "xLabel": str(x_col),
        "yLabel": str(y_col),
        "series": series,
    }


def _histogram_chart(frame, x_name, y_name, bins):
    column = column_by_name(frame, y_name) if y_name else column_by_name(frame, x_name)
    if column is None:
        raise ValueError("choose a numeric column for the histogram")
    series = pd.to_numeric(frame[column], errors="coerce").dropna()
    if len(series) == 0:
        raise ValueError("the chosen column has no numeric values")
    # Never ask for more bins than the values can populate.
    bins = max(3, min(bins, max(3, int(math.ceil(math.sqrt(len(series)))))))
    counts, edges = pd.cut(series, bins=bins, retbins=True, include_lowest=True)
    values = counts.value_counts(sort=False)
    points = []
    for interval, count in values.items():
        center = (interval.left + interval.right) / 2
        points.append({"x": round(float(center), 6), "y": int(count)})
    return {
        "kind": "histogram",
        "xType": "number",
        "xLabel": str(column),
        "yLabel": "count",
        "series": [{"name": f"count({column})", "points": points}],
    }


def _box_chart(frame, y_name, group_name):
    y_col = column_by_name(frame, y_name)
    if y_col is None or not pd.api.types.is_numeric_dtype(frame[y_col]):
        raise ValueError("box plots need a numeric y column")
    group_col = column_by_name(frame, group_name) if group_name else None
    subset = frame[[y_col] + ([group_col] if group_col is not None else [])].dropna(subset=[y_col])
    groups = [("all", subset)] if group_col is None else list(subset.groupby(group_col, dropna=False))
    groups.sort(key=lambda entry: len(entry[1]), reverse=True)
    boxes = []
    for group_value, part in groups[:12]:
        values = part[y_col]
        boxes.append({
            "name": "all" if group_col is None else str(to_py(group_value)),
            "min": to_py(values.min()),
            "q1": to_py(values.quantile(0.25)),
            "median": to_py(values.quantile(0.5)),
            "q3": to_py(values.quantile(0.75)),
            "max": to_py(values.max()),
            "count": int(len(values)),
        })
    return {
        "kind": "box",
        "xType": "category",
        "xLabel": str(group_col) if group_col is not None else "all",
        "yLabel": str(y_col),
        "boxes": boxes,
    }


def _heatmap_chart(frame, x_name, y_name, group_name, agg):
    row_col = column_by_name(frame, x_name)
    col_col = column_by_name(frame, group_name) if group_name else None
    value_col = column_by_name(frame, y_name) if y_name else None
    if row_col is None or col_col is None:
        raise ValueError("heatmaps need an x column and a group column")
    subset = frame[[row_col, col_col] + ([value_col] if value_col is not None else [])].copy()
    if value_col is None or agg == "count":
        grouped = subset.groupby([row_col, col_col], dropna=False).size().rename("__v__").reset_index()
    else:
        subset = subset.dropna(subset=[value_col])
        grouped = subset.groupby([row_col, col_col], dropna=False)[value_col].agg(agg).rename("__v__").reset_index()
    row_sizes = grouped.groupby(row_col, dropna=False).size()
    col_sizes = grouped.groupby(col_col, dropna=False).size()

    def busiest(sizes: pd.Series, limit: int) -> list:
        ordered = sorted(sizes.index, key=lambda value: (-int(sizes[value]), str(to_py(value))))
        return ordered[:limit]

    rows = [str(to_py(value)) for value in busiest(row_sizes, 20)]
    cols = [str(to_py(value)) for value in busiest(col_sizes, 12)]
    table = {}
    for _, row in grouped.iterrows():
        row_key = str(to_py(row[row_col]))
        col_key = str(to_py(row[col_col]))
        table[(row_key, col_key)] = to_py(row["__v__"])
    values = [[table.get((row, col)) for col in cols] for row in rows]
    return {
        "kind": "heatmap",
        "xType": "category",
        "xLabel": str(row_col),
        "yLabel": str(col_col),
        "rows": rows,
        "cols": cols,
        "values": values,
        "metric": "count" if value_col is None or agg == "count" else f"{agg}({value_col})",
    }


def chart_of(dataset: Dataset, spec: dict) -> dict:
    """Build a compact chart description; the browser renders it as SVG."""
    frame = dataset.frame
    spec = spec or {}
    kind = str(spec.get("type") or "line").lower()
    x_name = spec.get("x")
    y_name = spec.get("y")
    group_name = spec.get("group") or None
    agg = str(spec.get("agg") or "sum").lower()
    if agg not in ("sum", "mean", "count", "min", "max"):
        agg = "sum"
    bins = max(3, min(int(spec.get("bins") or 20), 100))
    if kind == "scatter":
        return _scatter_chart(frame, x_name, y_name, group_name)
    if kind == "histogram":
        return _histogram_chart(frame, x_name, y_name, bins)
    if kind == "box":
        return _box_chart(frame, y_name, group_name)
    if kind == "heatmap":
        return _heatmap_chart(frame, x_name, y_name, group_name, agg)
    if kind not in ("line", "bar"):
        raise ValueError(f"unknown chart type: {kind}")
    return _grouped_chart(frame, kind, x_name, y_name, group_name, agg)


def unique_columns(frame: pd.DataFrame) -> list[str]:
    """Column labels made unique and stringified for CSV/Excel writers."""
    names = []
    seen: dict[str, int] = {}
    for name in frame.columns:
        base = str(name) if str(name).strip() else "column"
        if base in seen:
            seen[base] += 1
            names.append(f"{base}_{seen[base]}")
        else:
            seen[base] = 0
            names.append(base)
    return names


def export_of(dataset: Dataset, fmt: str, sql, path: str, dataset_ids=None) -> dict:
    """Write the dataset or one query result to CSV/XLSX."""
    fmt = str(fmt or "csv").lower()
    if sql:
        connection = connection_for(dataset_ids or [dataset.id])
        try:
            frame = pd.read_sql_query(sql, connection)
        except Exception as error:
            raise ValueError(f"SQL error: {error}") from error
    else:
        frame = dataset.frame
    frame = frame.copy()
    frame.columns = unique_columns(frame)
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    if fmt == "csv":
        frame.to_csv(path, index=False, encoding="utf-8-sig")
    elif fmt == "xlsx":
        frame.to_excel(path, index=False, engine="openpyxl")
    else:
        raise ValueError(f"unsupported export format: {fmt}")
    return {"path": path, "rows": int(len(frame)), "bytes": os.path.getsize(path), "format": fmt}


def query_of(dataset: Dataset, sql: str, limit: int) -> dict:
    """Run one query against a single dataset's mirror."""
    return run_query(ensure_sqlite(dataset), sql, limit)


def handle(request: dict) -> dict:
    op = request.get("op")
    if op == "ping":
        return {"python": sys.version.split()[0], "pandas": pd.__version__}
    if op == "open":
        path = request.get("path")
        if not isinstance(path, str) or not path:
            raise ValueError("path is required")
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        max_rows = int(request.get("maxRows") or 0)
        frame, sheet, sheets, truncated = read_frame(path, request.get("sheet"), max_rows)
        global COUNTER
        COUNTER += 1
        ds_id = f"ds{COUNTER}"
        dataset = Dataset(ds_id, path, frame, sheet, truncated)
        DATASETS[ds_id] = dataset
        return {
            "dataset": {
                "id": ds_id,
                "path": path,
                "name": os.path.basename(path),
                "rows": int(len(frame)),
                "cols": int(len(frame.columns)),
                "sizeBytes": os.path.getsize(path),
                "sheet": sheet,
                "sheets": sheets,
                "truncated": truncated,
                "memoryBytes": memory_bytes(frame),
            },
            "profile": profile_of(frame),
        }
    if op == "reopen":
        # Re-register a dataset under its existing id after this process replaced
        # an earlier sidecar (idle shutdown or crash).
        ds_id = request.get("dataset")
        if not isinstance(ds_id, str) or not ds_id:
            raise ValueError("dataset is required")
        path = request.get("path")
        if not isinstance(path, str) or not path:
            raise ValueError("path is required")
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        drop_shared(ds_id)
        old = DATASETS.pop(ds_id, None)
        if old is not None and old.conn is not None:
            try:
                old.conn.close()
            except Exception:
                pass
        max_rows = int(request.get("maxRows") or 0)
        frame, sheet, sheets, truncated = read_frame(path, request.get("sheet"), max_rows)
        dataset = Dataset(ds_id, path, frame, sheet, truncated)
        DATASETS[ds_id] = dataset
        return {
            "dataset": {
                "id": ds_id,
                "path": path,
                "name": os.path.basename(path),
                "rows": int(len(frame)),
                "cols": int(len(frame.columns)),
                "sizeBytes": os.path.getsize(path),
                "sheet": sheet,
                "sheets": sheets,
                "truncated": truncated,
                "memoryBytes": memory_bytes(frame),
            },
            "profile": profile_of(frame),
        }
    if op == "profile":
        dataset = DATASETS.get(request.get("dataset"))
        if dataset is None:
            raise KeyError("unknown dataset")
        wanted = request.get("columns")
        result = profile_of(dataset.frame)
        if isinstance(wanted, list) and wanted:
            keep = {str(name) for name in wanted}
            result["columns"] = [column for column in result["columns"] if column["name"] in keep]
        return result
    if op == "preview":
        dataset = DATASETS.get(request.get("dataset"))
        if dataset is None:
            raise KeyError("unknown dataset")
        limit = request.get("limit", 50)
        limit = max(1, min(int(limit), MAX_ROWS))
        offset = max(0, int(request.get("offset", 0)))
        return preview_of(dataset, offset, limit, request.get("sort"), bool(request.get("desc")), request.get("where"))
    if op == "query":
        ids = request.get("datasets")
        if not isinstance(ids, list) or not ids:
            ds_id = request.get("dataset")
            ids = [ds_id] if ds_id else []
        ids = [ds_id for ds_id in ids if isinstance(ds_id, str)]
        if not ids:
            raise KeyError("unknown dataset")
        sql = request.get("sql")
        if not isinstance(sql, str) or not sql.strip():
            raise ValueError("sql is required")
        limit = max(1, min(int(request.get("limit", 50)), MAX_ROWS))
        return run_query(connection_for(ids), sql, limit)
    if op == "chart":
        dataset = DATASETS.get(request.get("dataset"))
        if dataset is None:
            raise KeyError("unknown dataset")
        return chart_of(dataset, request.get("spec") or {})
    if op == "export":
        dataset = DATASETS.get(request.get("dataset"))
        if dataset is None:
            raise KeyError("unknown dataset")
        path = request.get("path")
        if not isinstance(path, str) or not path:
            raise ValueError("path is required")
        ids = request.get("datasets")
        ids = [ds_id for ds_id in ids if isinstance(ds_id, str)] if isinstance(ids, list) else None
        return export_of(dataset, request.get("format") or "csv", request.get("sql"), path, ids)
    if op == "close":
        ds_id = request.get("dataset")
        dataset = DATASETS.pop(ds_id, None)
        if ds_id:
            drop_shared(ds_id)
        if dataset is not None and dataset.conn is not None:
            try:
                dataset.conn.close()
            except Exception:
                pass
        return {"closed": ds_id}
    raise ValueError(f"unknown op: {op!r}")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except Exception:
        pass
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = None
        try:
            request = json.loads(line)
            data = handle(request)
            emit({"id": request.get("id"), "ok": True, "data": data})
        except Exception as error:
            emit({
                "id": (request or {}).get("id"),
                "ok": False,
                "error": {
                    "code": type(error).__name__,
                    "message": str(error),
                    "trace": traceback.format_exc()[-1500:],
                },
            })


if __name__ == "__main__":
    main()
