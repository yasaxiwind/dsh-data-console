# Security

## Data handling

- Files are read on the local machine by a Python sidecar. Nothing is uploaded
  by this plugin, and it has no telemetry.
- Dropped or selected files are copied to `$DSH_HOME/data-console/cache/` so the
  sidecar gets a real path; copies older than 7 days are pruned at startup.
- SQL runs against an **in-memory** SQLite copy created from the loaded frame
  with `PRAGMA query_only = ON`. It cannot modify the source file, and DDL/DML
  statements are rejected by the read-only connection.
- The HTTP routes under `/api/data-console/` are same-origin authenticated
  routes registered through the Host connection service; no route is exposed
  publicly.
- The agent tools are bounded (at most 50 rows and 80 characters per cell) and
  only expose datasets the Host has opened.

## Reporting a vulnerability

Once the repository exists, report vulnerabilities through GitHub Security
Advisories (private) or open an issue with the `security` label if the report
does not need to stay private. Please include the DSH version, the plugin
version, and steps to reproduce.
