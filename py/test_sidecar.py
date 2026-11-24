"""Sidecar protocol smoke tests for the data console plugin.

Run with the Python that has pandas installed, for example:

    python py/test_sidecar.py -v

The tests spawn py/sidecar.py, build fixtures in a temporary directory and
exercise every operation the Host relies on.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
SIDECAR = HERE / "sidecar.py"


class SidecarProcess:
    """One sidecar subprocess speaking JSON-lines over stdio."""

    def __init__(self):
        self.proc = subprocess.Popen(
            [sys.executable, str(SIDECAR)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self.seq = 0

    def call(self, op, **kwargs):
        self.seq += 1
        payload = {"id": self.seq, "op": op}
        payload.update(kwargs)
        self.proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise AssertionError(f"sidecar died: {self.proc.stderr.read()}")
        return json.loads(line)

    def ok(self, op, **kwargs):
        reply = self.call(op, **kwargs)
        if not reply.get("ok"):
            raise AssertionError(f"{op} failed: {reply.get('error')}")
        return reply["data"]

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=10)
            self.proc.stdout.close()
            self.proc.stderr.close()
        except Exception:
            self.proc.kill()


class SidecarTests(unittest.TestCase):
    """Protocol-level behaviour shared by the panel and the agent tools."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="dc-sidecar-")
        cls.dir = pathlib.Path(cls.tmp.name)
        rows = 200
        frame = pd.DataFrame({
            "time": pd.date_range("2026-01-01", periods=rows, freq="10s").astype(str),
            "channel": ["A" if i % 2 == 0 else "B" for i in range(rows)],
            "value": [float(i) for i in range(rows)],
            "code": ["M1" if i % 3 == 0 else "M2" for i in range(rows)],
        })
        frame.loc[3, "value"] = None
        frame.to_csv(cls.dir / "sensor.csv", index=False)
        pd.DataFrame({
            "供应商": ["甲", "乙", "丙"],
            "物料": ["M1", "M1", "M2"],
            "单价": [10.5, 12.0, 8.5],
            "数量": [100, 200, 50],
        }).to_excel(cls.dir / "quote.xlsx", index=False)
        big = pd.DataFrame({"x": range(500)})
        big.to_csv(cls.dir / "big.csv", index=False)
        (cls.dir / "gbk.csv").write_bytes("名称,值\n温度,1.5\n压力,2.5\n".encode("gb18030"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.side = SidecarProcess()

    def tearDown(self):
        self.side.close()

    def open(self, name, **kwargs):
        return self.side.ok("open", path=str(self.dir / name), **kwargs)

    def test_ping(self):
        data = self.side.ok("ping")
        self.assertIn("pandas", data)
        self.assertTrue(data["python"])

    def test_open_profile_and_dtypes(self):
        opened = self.open("sensor.csv")
        dataset = opened["dataset"]
        self.assertEqual(dataset["rows"], 200)
        self.assertEqual(dataset["cols"], 4)
        self.assertGreater(dataset["memoryBytes"], 0)
        self.assertFalse(dataset["truncated"])
        by_name = {column["name"]: column for column in opened["profile"]["columns"]}
        self.assertTrue(by_name["time"]["dtype"].startswith("datetime64"))
        # M1/M2 must stay strings, not be coerced into dates.
        self.assertEqual(by_name["code"]["dtype"], "str")
        self.assertEqual(by_name["value"]["missing"], 1)

    def test_excel_sheet_and_columns(self):
        opened = self.open("quote.xlsx")
        dataset = opened["dataset"]
        self.assertIsNotNone(dataset["sheet"])
        names = [column["name"] for column in opened["profile"]["columns"]]
        self.assertEqual(names, ["供应商", "物料", "单价", "数量"])

    def test_preview_paging_and_sort(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        page = self.side.ok("preview", dataset=dataset_id, offset=0, limit=10)
        self.assertEqual(page["total"], 200)
        self.assertEqual(len(page["rows"]), 10)
        desc = self.side.ok("preview", dataset=dataset_id, offset=0, limit=5, sort="value", desc=True)
        values = [row[2] for row in desc["rows"]]
        self.assertEqual(values, sorted(values, reverse=True))

    def test_preview_filter_and_sort(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        filtered = self.side.ok("preview", dataset=dataset_id, offset=0, limit=5, where="value > 50", sort="value", desc=False)
        self.assertTrue(filtered.get("filtered"))
        self.assertEqual(filtered["total"], sum(1 for i in range(200) if i > 50))
        values = [row[2] for row in filtered["rows"]]
        self.assertEqual(values, sorted(values))

    def test_preview_filter_error(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        reply = self.side.call("preview", dataset=dataset_id, offset=0, limit=5, where="nope > 1")
        self.assertFalse(reply["ok"])
        self.assertIn("no such column", reply["error"]["message"])

    def test_query_aggregate_and_error(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        result = self.side.ok("query", datasets=[dataset_id], sql="select channel, count(*) n from data group by channel order by channel")
        self.assertEqual(result["rows"], [["A", 100], ["B", 100]])
        bad = self.side.call("query", datasets=[dataset_id], sql="select nope from data")
        self.assertFalse(bad["ok"])
        self.assertIn("no such column", bad["error"]["message"])

    def test_multi_table_join_and_readonly(self):
        sensor_id = self.open("sensor.csv")["dataset"]["id"]
        quote_id = self.open("quote.xlsx")["dataset"]["id"]
        joined = self.side.ok(
            "query",
            datasets=[sensor_id, quote_id],
            sql=f"select count(*) c from data cross join {quote_id}",
        )
        self.assertEqual(joined["rows"], [[600]])
        blocked = self.side.call("query", datasets=[sensor_id, quote_id], sql=f"delete from {quote_id}")
        self.assertFalse(blocked["ok"])
        self.assertIn("readonly", blocked["error"]["message"].lower())

    def test_charts(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        line = self.side.ok("chart", dataset=dataset_id, spec={"type": "bar", "x": "channel", "y": "value", "agg": "mean"})
        self.assertEqual(line["kind"], "bar")
        self.assertEqual(len(line["series"]), 1)
        self.assertEqual(len(line["series"][0]["points"]), 2)
        box = self.side.ok("chart", dataset=dataset_id, spec={"type": "box", "y": "value", "group": "channel"})
        self.assertEqual(len(box["boxes"]), 2)
        hist = self.side.ok("chart", dataset=dataset_id, spec={"type": "histogram", "y": "value", "bins": 50})
        self.assertLessEqual(len(hist["series"][0]["points"]), 50)
        heat = self.side.ok("chart", dataset=dataset_id, spec={"type": "heatmap", "x": "channel", "group": "code", "y": "value", "agg": "mean"})
        self.assertEqual(heat["rows"], ["A", "B"])
        bad = self.side.call("chart", dataset=dataset_id, spec={"type": "scatter", "x": "channel", "y": "value"})
        self.assertFalse(bad["ok"])

    def test_export_csv_and_xlsx(self):
        dataset_id = self.open("sensor.csv")["dataset"]["id"]
        csv_path = self.dir / "out.csv"
        csv_result = self.side.ok("export", dataset=dataset_id, format="csv", path=str(csv_path))
        self.assertEqual(csv_result["rows"], 200)
        self.assertTrue(csv_path.exists())
        frame = pd.read_csv(csv_path)
        self.assertEqual(list(frame.columns), ["time", "channel", "value", "code"])
        xlsx_path = self.dir / "out.xlsx"
        xlsx_result = self.side.ok("export", dataset=dataset_id, format="xlsx", path=str(xlsx_path),
                                   sql="select channel, count(*) n from data group by channel")
        self.assertEqual(xlsx_result["rows"], 2)
        self.assertEqual(len(pd.read_excel(xlsx_path)), 2)

    def test_max_rows_truncates(self):
        opened = self.open("big.csv", maxRows=100)
        self.assertEqual(opened["dataset"]["rows"], 100)
        self.assertTrue(opened["dataset"]["truncated"])

    def test_gb18030_csv(self):
        opened = self.open("gbk.csv")
        self.assertEqual(opened["dataset"]["rows"], 2)
        names = [column["name"] for column in opened["profile"]["columns"]]
        self.assertEqual(names, ["名称", "值"])

    def test_reopen_keeps_id(self):
        opened = self.open("sensor.csv")
        dataset_id = opened["dataset"]["id"]
        again = self.side.ok("reopen", dataset=dataset_id, path=str(self.dir / "sensor.csv"), maxRows=0)
        self.assertEqual(again["dataset"]["id"], dataset_id)
        self.assertEqual(again["dataset"]["rows"], 200)
        page = self.side.ok("preview", dataset=dataset_id, offset=0, limit=5)
        self.assertEqual(len(page["rows"]), 5)
        self.assertEqual(page["total"], 200)

    def test_unknown_dataset(self):
        reply = self.side.call("preview", dataset="ds999", offset=0, limit=5)
        self.assertFalse(reply["ok"])
        self.assertIn("unknown dataset", reply["error"]["message"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
