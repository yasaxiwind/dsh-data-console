/**
 * Data console — Host half.
 *
 * Runs a small Python sidecar (pandas) and exposes:
 *  - model-facing tools: data_open, data_list, data_profile, data_query;
 *  - authenticated `/api/data-console/*` routes for the Client panel.
 *
 * The sidecar speaks one JSON request per line over stdin/stdout. Requests are
 * serialized here because the sidecar executes them one at a time.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, basename, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'data-console'
export const inject = ['tools', 'connection']

/**
 * Local tool-definition helper. The shipped `defineTool` cannot be imported by
 * a linked plugin here (bare `@deepseek-ai/*` specifiers do not resolve from a
 * workspace directory), so the registry-ready shape is produced directly:
 * a JSON Schema for the parameters and `{ schema, render }` for the output.
 * @param {object} options - tool definition fields.
 * @returns {object} the registry-ready definition.
 */
function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: options.output,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    async execute(args, exec) {
      return await options.execute(args, exec)
    },
  }
}

const DEFAULTS = {
  pythonPath: '',
  maxFileMB: 256,
  idleTimeoutMs: 600_000,
}

const SCRIPT_PATH = fileURLToPath(new URL('./py/sidecar.py', import.meta.url))
const SUPPORTED = new Set(['.csv', '.tsv', '.txt', '.xlsx', '.xlsm', '.xls', '.json'])
const MAX_TOOL_ROWS = 20
const MAX_TOOL_CELL = 80
const MAX_WRITE_BYTES = 20 * 1024 * 1024

/**
 * Locate DSH_HOME without relying on shell-only environment variables.
 * @returns {string} the harness home directory.
 */
function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  if (process.env.DSH_PROFILE_DIR) return dirname(dirname(process.env.DSH_PROFILE_DIR))
  return join(homedir(), '.dsh')
}

/** Settings stored outside the bundle so a plugin upgrade never loses them. */
const SETTINGS_PATH = join(dshHome(), 'data-console', 'settings.json')

/** Open/recent dataset bookkeeping so a restart can offer them again. */
const DATASETS_PATH = join(dshHome(), 'data-console', 'datasets.json')
/** Dropped/selected files are copied here so the sidecar gets a real path. */
const UPLOAD_DIR = join(dshHome(), 'data-console', 'cache')
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RESTORE = 8
const MAX_RECENT = 20

/**
 * Read persisted dataset lists; a missing or broken file yields empty lists.
 * @returns {{ open: object[], recent: object[] }} stored entries.
 */
function loadDatasetState() {
  try {
    const parsed = JSON.parse(readFileSync(DATASETS_PATH, 'utf8'))
    const clean = (list) => (Array.isArray(list) ? list : [])
      .filter(entry => entry !== null && typeof entry === 'object' && typeof entry.path === 'string')
      .slice(0, MAX_RECENT)
    return { open: clean(parsed.open).slice(0, MAX_RESTORE), recent: clean(parsed.recent) }
  } catch {
    return { open: [], recent: [] }
  }
}

/**
 * Remove uploaded copies that nobody reopened for a week.
 * Runs once per plugin start; failures are ignored.
 * @returns {void}
 */
function pruneUploads() {
  try {
    if (!existsSync(UPLOAD_DIR)) return
    const now = Date.now()
    for (const entry of readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = join(UPLOAD_DIR, entry.name)
      let newest = 0
      try {
        for (const file of readdirSync(directory)) {
          newest = Math.max(newest, statSync(join(directory, file)).mtimeMs)
        }
      } catch {
        newest = 0
      }
      if (now - newest > UPLOAD_TTL_MS) rmSync(directory, { recursive: true, force: true })
    }
  } catch {
    // Cache hygiene must never break startup.
  }
}

const DEFAULT_SETTINGS = {
  maxFileMB: 0,
  maxRows: 0,
  defaultChartType: 'line',
  defaultAgg: 'mean',
  pythonPath: '',
}

const CHART_TYPES = ['line', 'bar', 'scatter', 'histogram', 'box', 'heatmap']
const AGGREGATIONS = ['sum', 'mean', 'count', 'min', 'max']

/**
 * Validate persisted settings, dropping unknown or out-of-range values.
 * @param {unknown} input - parsed settings JSON.
 * @returns {typeof DEFAULT_SETTINGS} normalized settings.
 */
function normalizeSettings(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const settings = { ...DEFAULT_SETTINGS }
  const fileMB = Number(source.maxFileMB)
  if (Number.isFinite(fileMB) && fileMB >= 1 && fileMB <= 4096) settings.maxFileMB = Math.round(fileMB)
  const rows = Number(source.maxRows)
  if (Number.isFinite(rows) && rows >= 1 && rows <= 50_000_000) settings.maxRows = Math.round(rows)
  if (CHART_TYPES.includes(source.defaultChartType)) settings.defaultChartType = source.defaultChartType
  if (AGGREGATIONS.includes(source.defaultAgg)) settings.defaultAgg = source.defaultAgg
  if (typeof source.pythonPath === 'string') settings.pythonPath = source.pythonPath.trim().slice(0, 500)
  return settings
}

/**
 * Read persisted settings; a missing or broken file falls back to defaults.
 * @returns {typeof DEFAULT_SETTINGS} the stored settings.
 */
function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * A monotonic-looking filename stamp: 20261123-205512.
 * @returns {string} the stamp.
 */
function stamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * Keep a user-provided name safe for one filesystem segment.
 * @param {unknown} value - proposed name.
 * @returns {string} a safe segment without an extension.
 */
function safeName(value) {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80)
  return cleaned === '' ? 'export' : cleaned
}

/**
 * Candidate Python interpreters, most specific first.
 * @param {object} config - plugin configuration.
 * @returns {string[]} paths and PATH commands to probe.
 */
function pythonCandidates(config) {
  const list = []
  if (config.pythonPath) list.push(config.pythonPath)
  if (process.env.DSH_PYTHON) list.push(process.env.DSH_PYTHON)
  const home = process.env.DSH_HOME
  if (home) {
    const runtimes = join(home, 'dsh-runtimes')
    try {
      for (const entry of readdirSync(runtimes)) {
        for (const relative of [
          ['dependencies', 'python', 'python.exe'],
          ['dependencies', 'python', 'bin', 'python3'],
          ['dependencies', 'python', 'bin', 'python'],
        ]) {
          const candidate = join(runtimes, entry, ...relative)
          if (existsSync(candidate)) list.push(candidate)
        }
      }
    } catch {
      // No managed runtimes on this installation.
    }
  }
  list.push('python', 'python3', 'py')
  return list
}

/**
 * Pick the first interpreter that imports pandas.
 * @param {object} config - plugin configuration.
 * @returns {string | null} the interpreter command, or null when none works.
 */
function resolvePython(config) {
  for (const candidate of pythonCandidates(config)) {
    if (isAbsolute(candidate)) {
      if (!existsSync(candidate)) continue
      return candidate
    }
    const probe = spawnSync(candidate, ['-c', 'import pandas; print("ok")'], {
      encoding: 'utf8', timeout: 20_000, windowsHide: true,
    })
    if (probe.status === 0) return candidate
  }
  return null
}

/** One sidecar process with serialized requests. */
class Sidecar {
  /**
   * @param {() => string | null} pythonOf - lazy interpreter lookup.
   * @param {number} idleTimeoutMs - kill an idle sidecar after this long.
   * @param {(line: string) => void} log - stderr sink.
   */
  constructor(pythonOf, idleTimeoutMs, log) {
    this.pythonOf = pythonOf
    this.idleTimeoutMs = idleTimeoutMs
    this.log = log
    this.child = undefined
    this.pending = new Map()
    this.seq = 0
    this.buffer = ''
    this.queue = Promise.resolve()
    this.idleTimer = undefined
    /** Increments for every spawned process; datasets belong to one generation. */
    this.generation = 0
  }

  /** @returns {Promise<void>} resolves when the process is up. */
  async ensure() {
    if (this.child !== undefined && this.child.exitCode === null) return
    const python = this.pythonOf()
    if (python === null) {
      const error = new Error('No Python interpreter with pandas was found. Set `pythonPath` in the data-console config row or install Python with pandas.')
      error.code = 'NO_PYTHON'
      throw error
    }
    const child = spawn(python, [SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => this.#onData(chunk))
    child.stderr.on('data', chunk => this.log(`[data-console sidecar] ${String(chunk).trimEnd()}`))
    child.on('error', (error) => this.#failAll(error))
    child.on('exit', (code) => {
      this.child = undefined
      this.generation += 1
      this.#failAll(new Error(`data-console sidecar exited with code ${code}`))
    })
    this.child = child
    this.generation += 1
    try {
      await this.#callOnce('ping', {}, 20_000)
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  /**
   * Queue one request behind the previous one.
   * @param {string} op - sidecar operation.
   * @param {object} payload - operation arguments.
   * @param {number} [timeoutMs] - per-request deadline.
   * @returns {Promise<any>} the operation result.
   */
  async call(op, payload, timeoutMs = 60_000) {
    const run = this.queue.then(() => this.#callOnce(op, payload, timeoutMs))
    this.queue = run.catch(() => {})
    return run
  }

  async #callOnce(op, payload, timeoutMs) {
    await this.ensure()
    this.#touchIdle()
    const child = this.child
    if (child === undefined || child.exitCode !== null) throw new Error('data-console sidecar is not running')
    const id = ++this.seq
    const request = JSON.stringify({ id, op, ...payload })
    return await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectPromise(new Error(`data-console ${op} timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
      child.stdin.write(request + '\n', (error) => {
        if (error) {
          clearTimeout(timer)
          this.pending.delete(id)
          rejectPromise(error)
        }
      })
    })
  }

  #onData(chunk) {
    this.buffer += chunk
    while (true) {
      const index = this.buffer.indexOf('\n')
      if (index < 0) break
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line === '') continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        this.log(`[data-console sidecar] unparseable line: ${line.slice(0, 200)}`)
        continue
      }
      const entry = this.pending.get(message.id)
      if (entry === undefined) continue
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.ok === true) entry.resolve(message.data)
      else {
        const error = new Error(message.error?.message ?? 'sidecar error')
        error.code = message.error?.code ?? 'SIDECAR_ERROR'
        error.trace = message.error?.trace
        entry.reject(error)
      }
    }
  }

  #failAll(error) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
      this.pending.delete(id)
    }
  }

  #touchIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.dispose(), this.idleTimeoutMs)
    if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref()
  }

  /** Stop the sidecar and reject anything still waiting. */
  dispose() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    this.#failAll(new Error('data-console sidecar stopped'))
    const child = this.child
    this.child = undefined
    this.buffer = ''
    if (child !== undefined) this.generation += 1
    if (child === undefined) return
    try {
      child.stdin.end()
    } catch {
      // Already closed.
    }
    try {
      child.kill()
    } catch {
      // Already gone.
    }
  }
}

/**
 * Convert one cell for terminal-style text output.
 * @param {unknown} value - JSON value.
 * @returns {string} a capped display string.
 */
function cellText(value) {
  if (value === null || value === undefined) return '—'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_TOOL_CELL ? `${text.slice(0, MAX_TOOL_CELL - 1)}…` : text
}

/**
 * Render a small fixed-width table for model-facing text.
 * @param {string[]} columns - header names.
 * @param {unknown[][]} rows - row values.
 * @param {number} maxRows - row cap.
 * @returns {string} the table.
 */
function gridText(columns, rows, maxRows) {
  const visible = rows.slice(0, maxRows)
  const widths = columns.map((column, index) => {
    let width = String(column).length
    for (const row of visible) width = Math.max(width, cellText(row[index]).length)
    return Math.min(width, 28)
  })
  const line = (cells) => cells.map((cell, index) => {
    const text = cellText(cell)
    const capped = text.length > widths[index] ? `${text.slice(0, Math.max(1, widths[index] - 1))}…` : text
    return capped.padEnd(widths[index])
  }).join('  ').trimEnd()
  const header = line(columns)
  const separator = widths.map(width => '─'.repeat(width)).join('  ')
  const body = visible.map(row => line(row))
  const remaining = rows.length - visible.length
  return [header, separator, ...body, remaining > 0 ? `… ${remaining} more row(s)` : '']
    .filter(entry => entry !== '')
    .join('\n')
}

/**
 * Render a profile as text.
 * @param {object} profile - sidecar profile payload.
 * @returns {string} the summary and column table.
 */
function profileText(profile) {
  const head = `${profile.rows.toLocaleString()} rows × ${profile.cols} columns`
  const rows = profile.columns.map((column) => {
    let extra = ''
    if (column.min !== undefined && column.max !== undefined) extra = `${cellText(column.min)} … ${cellText(column.max)}`
    else if (Array.isArray(column.top) && column.top.length > 0) {
      extra = column.top.slice(0, 3).map(entry => `${cellText(entry.value)}(${entry.count})`).join(' ')
    }
    return [column.name, column.dtype, column.missing, column.unique ?? '—', extra]
  })
  const table = gridText(['column', 'dtype', 'missing', 'unique', 'range / top values'], rows, 60)
  return `${head}\n\n${table}`
}

export function apply(ctx, config) {
  config = { ...DEFAULTS, ...(config ?? {}) }
  config.maxFileMB = Number(config.maxFileMB) || DEFAULTS.maxFileMB
  config.idleTimeoutMs = Number(config.idleTimeoutMs) || DEFAULTS.idleTimeoutMs
  const log = (line) => {
    if (typeof ctx.logger !== 'function') return
    try {
      ctx.logger('data-console').info(line)
    } catch {
      // Logging must never break a request.
    }
  }
  let settings = loadSettings()
  let python
  const pythonOf = () => {
    if (python === undefined) {
      python = resolvePython({ ...config, pythonPath: settings.pythonPath || config.pythonPath })
    }
    return python
  }
  const sidecar = new Sidecar(pythonOf, config.idleTimeoutMs, log)

  /**
   * Settings with the bundle defaults applied for values the user left empty.
   * @returns {object} effective settings.
   */
  function effectiveSettings() {
    return {
      ...settings,
      maxFileMB: settings.maxFileMB > 0 ? settings.maxFileMB : config.maxFileMB,
      maxRows: settings.maxRows > 0 ? settings.maxRows : 5_000_000,
    }
  }

  /**
   * Persist settings and restart the sidecar when the interpreter changes.
   * @param {unknown} input - proposed settings.
   * @returns {object} effective settings after the change.
   */
  function saveSettings(input) {
    const next = normalizeSettings(input)
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true })
    writeFileSync(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    if (next.pythonPath !== settings.pythonPath) {
      python = undefined
      sidecar.dispose()
    }
    settings = next
    return effectiveSettings()
  }
  ctx.effect(() => () => sidecar.dispose(), 'data-console: sidecar lifecycle')

  /** Datasets opened in this Host process, keyed by id. */
  const datasets = new Map()
  /** Base directory for relative paths typed in the panel; follows the last opened file. */
  let lastDir = process.cwd()
  /** Persisted open/recent bookkeeping; refreshed from disk on startup. */
  let datasetState = loadDatasetState()
  let restoreStarted = false

  /** Persist the open/recent lists. */
  function saveDatasetState() {
    try {
      mkdirSync(dirname(DATASETS_PATH), { recursive: true })
      writeFileSync(DATASETS_PATH, `${JSON.stringify(datasetState, null, 2)}\n`, 'utf8')
    } catch (error) {
      log(`could not save the dataset state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Remember one dataset as open and most recent.
   * @param {object} record - stored dataset record.
   * @returns {void}
   */
  function rememberDataset(record) {
    const requestedSheet = record.requestedSheet ?? null
    const same = entry => entry.path === record.path && (entry.requestedSheet ?? null) === requestedSheet
    const now = Date.now()
    datasetState.open = [{
      path: record.path,
      requestedSheet,
      ownerSessionId: record.ownerSessionId ?? null,
      openedAt: now,
    }, ...datasetState.open.filter(entry => !same(entry))].slice(0, MAX_RESTORE)
    datasetState.recent = [{
      path: record.path,
      requestedSheet,
      name: record.name,
      openedAt: now,
    }, ...datasetState.recent.filter(entry => !same(entry))].slice(0, MAX_RECENT)
    saveDatasetState()
  }

  /**
   * Forget one dataset's open entry (its recent entry stays).
   * @param {object} record - stored dataset record.
   * @returns {void}
   */
  function forgetDataset(record) {
    const requestedSheet = record.requestedSheet ?? null
    datasetState.open = datasetState.open.filter(entry => (
      entry.path !== record.path || (entry.requestedSheet ?? null) !== requestedSheet
    ))
    saveDatasetState()
  }

  /**
   * Re-open the datasets that were open before the last restart.
   * Runs in the background; missing files are skipped, failures logged.
   * @returns {Promise<void>}
   */
  async function restoreOpenDatasets() {
    if (restoreStarted) return
    restoreStarted = true
    const entries = [...datasetState.open].slice(0, MAX_RESTORE)
    for (const entry of entries) {
      if (datasets.size >= MAX_RESTORE) break
      if (!existsSync(entry.path)) {
        log(`restore skipped (missing): ${entry.path}`)
        continue
      }
      try {
        await openDataset(entry.path, undefined, entry.requestedSheet ?? null, entry.ownerSessionId ?? null, true)
      } catch (error) {
        log(`restore skipped: ${entry.path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /**
   * Resolve a user/model path against an optional base directory.
   * @param {string} input - absolute or relative path.
   * @param {string} [base] - base directory for relative paths.
   * @returns {string} the absolute path.
   */
  function resolvePath(input, base) {
    return resolve(base ?? process.cwd(), input)
  }

  /**
   * Validate a path and its size before handing it to the sidecar.
   * @param {string} input - requested path.
   * @param {string} [base] - base directory.
   * @returns {{ path: string, sizeBytes: number, mtimeMs: number }} the validated file.
   */
  function validateFile(input, base) {
    if (typeof input !== 'string' || input.trim() === '') throw new Error('a file path is required')
    const path = resolvePath(input.trim(), base)
    if (!existsSync(path)) throw new Error(`file not found: ${path}`)
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error(`not a file: ${path}`)
    const extension = extname(path).toLowerCase()
    if (!SUPPORTED.has(extension)) {
      throw new Error(`unsupported file type "${extension || '(none)'}"; supported: CSV, TSV, TXT, XLSX, XLSM, JSON`)
    }
    const limitMB = effectiveSettings().maxFileMB
    const limit = limitMB * 1024 * 1024
    if (stat.size > limit) {
      throw new Error(`file is ${(stat.size / 1048576).toFixed(1)} MB; the limit is ${limitMB} MB (change it in the data console settings)`)
    }
    return { path, sizeBytes: stat.size, mtimeMs: stat.mtimeMs }
  }

  /**
   * Open a dataset through the sidecar and remember it.
   * @param {string} input - requested path.
   * @param {string} [base] - base directory for relative paths.
   * @param {string | number} [sheet] - Excel sheet name or index.
   * @returns {Promise<{ dataset: object, profile: object }>} the opened dataset.
   */
  async function openDataset(input, base, sheet, ownerSessionId, restoring = false) {
    const { path, mtimeMs } = validateFile(input, base)
    const sheetName = sheet ?? null
    for (const record of [...datasets.values()]) {
      if (record.path === path && (record.requestedSheet ?? null) === sheetName) {
        if (typeof record.mtimeMs === 'number' && record.mtimeMs !== mtimeMs) {
          datasets.delete(record.id)
          await sidecar.call('close', { dataset: record.id }).catch(() => {})
          continue
        }
        lastDir = dirname(path)
        if ((record.ownerSessionId ?? null) === null && ownerSessionId) record.ownerSessionId = ownerSessionId
        return { dataset: publicDataset(record), profile: record.profile }
      }
    }
    const result = await sidecar.call('open', { path, sheet, maxRows: effectiveSettings().maxRows }, 180_000)
    const record = {
      id: result.dataset.id,
      path: result.dataset.path,
      name: result.dataset.name,
      rows: result.dataset.rows,
      cols: result.dataset.cols,
      sizeBytes: result.dataset.sizeBytes,
      sheet: result.dataset.sheet,
      requestedSheet: sheetName,
      sheets: result.dataset.sheets,
      truncated: result.dataset.truncated === true,
      memoryBytes: Number(result.dataset.memoryBytes) || 0,
      generation: sidecar.generation,
      mtimeMs,
      openedAt: Date.now(),
      ownerSessionId: ownerSessionId ?? null,
      profile: result.profile,
    }
    datasets.set(record.id, record)
    if (!restoring) rememberDataset(record)
    lastDir = dirname(record.path)
    return { dataset: publicDataset(record), profile: record.profile }
  }

  /**
   * Re-register one dataset when the sidecar process has been replaced.
   * @param {object} record - stored dataset.
   * @returns {Promise<void>}
   */
  async function ensureDatasetLive(record) {
    if (record.generation === sidecar.generation) return
    try {
      const result = await sidecar.call('reopen', {
        dataset: record.id,
        path: record.path,
        sheet: record.requestedSheet ?? null,
        maxRows: effectiveSettings().maxRows,
      }, 180_000)
      record.generation = sidecar.generation
      if (result.profile !== undefined) record.profile = result.profile
      if (result.dataset !== undefined) {
        record.rows = result.dataset.rows
        record.cols = result.dataset.cols
        record.memoryBytes = result.dataset.memoryBytes
        record.truncated = result.dataset.truncated === true
      }
    } catch (error) {
      throw new Error(`dataset ${record.id} (${record.name}) is no longer loaded and could not be reopened: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Re-register every open dataset when the sidecar process has been replaced.
   * @returns {Promise<void>}
   */
  async function ensureAllDatasetsLive() {
    for (const record of datasets.values()) {
      try {
        await ensureDatasetLive(record)
      } catch (error) {
        // A dataset whose file vanished must not block queries over the others;
        // referencing it still fails with the sidecar's unknown-dataset error.
        log(`could not reopen ${record.id} (${record.name}): ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /**
   * Strip internal fields before sending a dataset to the browser.
   * @param {object} record - stored dataset record.
   * @returns {object} the public shape.
   */
  function publicDataset(record) {
    return {
      id: record.id,
      path: record.path,
      name: record.name,
      rows: record.rows,
      cols: record.cols,
      sizeBytes: record.sizeBytes,
      sheet: record.sheet,
      sheets: record.sheets,
      truncated: record.truncated === true,
      memoryBytes: record.memoryBytes ?? 0,
      openedAt: record.openedAt,
      ownerSessionId: record.ownerSessionId ?? null,
    }
  }

  /**
   * Pick a dataset by id or the only one loaded.
   * @param {string | undefined} id - requested id.
   * @returns {object} the stored dataset record.
   */
  function pickDataset(id, sessionId) {
    if (typeof id === 'string' && id !== '') {
      const record = datasets.get(id)
      if (record === undefined) throw new Error(`unknown dataset: ${id}`)
      return record
    }
    const all = [...datasets.values()]
    if (all.length === 0) throw new Error('no dataset is open; call data_open first')
    if (all.length === 1) return all[0]
    const mine = all.filter(record => (record.ownerSessionId ?? null) === (sessionId ?? null))
    if (mine.length === 1) return mine[0]
    if (mine.length > 1) {
      throw new Error(`this session has ${mine.length} open datasets (${mine.map(record => record.id).join(', ')}); pass the dataset id`)
    }
    throw new Error(`several datasets are open (${all.map(record => record.id).join(', ')}); pass the dataset id`)
  }

  /**
   * Session id of the calling agent, when the tool runs inside a session.
   * @param {object} exec - tool execution context.
   * @returns {string | null} the session id.
   */
  function sessionIdOf(exec) {
    const id = exec?.agent?.session?.header?.id
    return typeof id === 'string' && id !== '' ? id : null
  }

  /**
   * List open datasets for one session: its own first, then the rest.
   * @param {string | null} sessionId - requesting session.
   * @returns {object[]} public dataset rows.
   */
  function listDatasets(sessionId) {
    const rows = [...datasets.values()].map(publicDataset)
    rows.sort((a, b) => {
      const mineA = (a.ownerSessionId ?? null) === (sessionId ?? null) ? 0 : 1
      const mineB = (b.ownerSessionId ?? null) === (sessionId ?? null) ? 0 : 1
      return mineA - mineB || b.openedAt - a.openedAt
    })
    return rows
  }

  /**
   * Table names available to one query: the primary dataset first, then every other open one.
   * @param {object} record - primary dataset.
   * @returns {string[]} dataset ids in registration order.
   */
  function datasetIdsFor(record) {
    return [record.id, ...[...datasets.keys()].filter(id => id !== record.id)]
  }

  /**
   * Export a dataset or one query result to CSV/XLSX.
   * @param {object} record - stored dataset.
   * @param {string} format - `csv` or `xlsx`.
   * @param {string | undefined} sql - optional query to export instead of the frame.
   * @param {string | undefined} path - optional explicit target.
   * @param {string | undefined} base - base directory for a relative target.
   * @returns {Promise<{path: string, rows: number, bytes: number}>} the written file.
   */
  async function exportDataset(record, format, sql, path, base) {
    const fmt = String(format ?? 'csv').toLowerCase()
    if (fmt !== 'csv' && fmt !== 'xlsx') throw new Error('format must be csv or xlsx')
    await (typeof sql === 'string' && sql.trim() !== '' ? ensureAllDatasetsLive() : ensureDatasetLive(record))
    const stem = record.name.replace(/\.[^.]+$/, '')
    const target = path !== undefined && String(path).trim() !== ''
      ? resolvePath(String(path), base)
      : join(lastDir, `${safeName(stem)}-${stamp()}.${fmt}`)
    return await sidecar.call('export', {
      dataset: record.id,
      datasets: sql ? datasetIdsFor(record) : [record.id],
      format: fmt,
      sql: typeof sql === 'string' && sql.trim() !== '' ? sql : null,
      path: target,
    }, 180_000)
  }

  // ---------------------------------------------------------------- tools

  ctx.tools.register(defineTool({
    name: 'data_open',
    description: 'Open a CSV/TSV/TXT/XLSX/XLSM/JSON file in the data console and return its size and column profile. Relative paths resolve against the session working directory. Use this before data_profile or data_query.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute, or relative to the session working directory)' },
        sheet: { type: 'string', description: 'Excel sheet name (defaults to the first sheet)' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const cwd = exec.agent?.session?.header?.cwd
      const { dataset, profile } = await openDataset(args.path, cwd, args.sheet, sessionIdOf(exec))
      const sheets = Array.isArray(dataset.sheets) && dataset.sheets.length > 1
        ? `\nsheets: ${dataset.sheets.join(', ')} (open with sheet="<name>")`
        : ''
      return `Opened dataset ${dataset.id}: ${dataset.name}\n${profile.rows.toLocaleString()} rows × ${profile.cols} columns · ${dataset.path}${sheets}\n\n${profileText(profile)}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_list',
    description: 'List the datasets currently open in the data console.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      if (datasets.size === 0) return 'No dataset is open yet. Use data_open.'
      const sessionId = sessionIdOf(exec)
      return listDatasets(sessionId).map((record) => {
        const mine = (record.ownerSessionId ?? null) === sessionId
        return `${record.id} · ${record.name} · ${record.rows.toLocaleString()} rows × ${record.cols} cols · ${record.path}${mine ? '' : ' · other session'}`
      }).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_profile',
    description: 'Show the column profile (type, missing, unique, range or top values) of an open dataset. Answers "what is in this file" without loading rows into context.',
    parameters: {
      type: 'object',
      properties: {
        dataset: { type: 'string', description: 'Dataset id; omit when exactly one dataset is open' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Only these column names' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const record = pickDataset(args.dataset, sessionIdOf(exec))
      let profile = record.profile
      if (Array.isArray(args.columns) && args.columns.length > 0) {
        await ensureDatasetLive(record)
        profile = await sidecar.call('profile', { dataset: record.id, columns: args.columns })
      }
      return `${record.name} (${record.id})\n\n${profileText(profile)}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_query',
    description: 'Run a SQL query over the open datasets. The primary dataset is `data`; every other open dataset is also available by its id (`ds2`, `ds3`, …), so tables can be joined. SQLite dialect: SELECT channel, avg(value) FROM data GROUP BY channel. Returns at most 50 rows; keep the query aggregated.',
    parameters: {
      type: 'object',
      properties: {
        dataset: { type: 'string', description: 'Primary dataset id; omit when exactly one dataset is open' },
        sql: { type: 'string', description: 'SQL query against `data` and/or `ds<id>` tables' },
        limit: { type: 'number', description: 'Maximum rows to print (default 20, cap 50)' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const record = pickDataset(args.dataset, sessionIdOf(exec))
      const limit = Math.max(1, Math.min(Number(args.limit ?? MAX_TOOL_ROWS), 50))
      await ensureAllDatasetsLive()
      const result = await sidecar.call('query', {
        datasets: datasetIdsFor(record),
        sql: args.sql,
        limit,
      })
      if (result.columns.length === 0) return `${result.message ?? 'statement executed'} (${result.ms} ms)`
      const truncation = result.truncated ? `\n(truncated at ${result.returned} rows; aggregate or add LIMIT for a smaller result)` : ''
      return `${gridText(result.columns, result.rows, limit)}\n\n${result.returned} row(s) in ${result.ms} ms${truncation}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_export',
    description: 'Export an open dataset, or one SQL query result, to a CSV or XLSX file in the workspace. Returns the written path and row count.',
    parameters: {
      type: 'object',
      properties: {
        dataset: { type: 'string', description: 'Dataset id; omit when exactly one dataset is open' },
        format: { type: 'string', enum: ['csv', 'xlsx'], description: 'File format (default csv)' },
        sql: { type: 'string', description: 'Optional SQL query whose result is exported instead of the whole table' },
        path: { type: 'string', description: 'Optional target path; defaults to the last opened folder' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const record = pickDataset(args.dataset, sessionIdOf(exec))
      const cwd = exec.agent?.session?.header?.cwd
      const result = await exportDataset(record, args.format ?? 'csv', args.sql, args.path, cwd)
      const size = result.bytes < 1024 ? `${result.bytes} B` : `${(result.bytes / 1024).toFixed(1)} KB`
      return `Exported ${result.rows.toLocaleString()} row(s) to ${result.path} (${size})`
    },
  }))

  // --------------------------------------------------------------- routes

  /**
   * Build a JSON Response.
   * @param {number} status - HTTP status.
   * @param {object} body - JSON body.
   * @returns {Response} the response.
   */
  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  /**
   * Wrap a route handler with uniform error mapping.
   * @param {(request: Request) => Promise<object>} handler - body of the route.
   * @returns {(request: Request) => Promise<Response>} the HTTP handler.
   */
  function route(handler) {
    return async (request) => {
      try {
        return json(200, { ok: true, ...(await handler(request)) })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = error?.code ?? 'ERROR'
        const status = code === 'NO_PYTHON' ? 503 : /not found|unknown dataset|required|unsupported|limit is/.test(message) ? 400 : 500
        return json(status, { ok: false, error: { code: String(code), message } })
      }
    }
  }

  const routes = [
    {
      path: '/api/data-console/meta',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: route(async (request) => ({
        baseDir: lastDir,
        python: pythonOf(),
        maxFileMB: effectiveSettings().maxFileMB,
        settings: effectiveSettings(),
        supported: [...SUPPORTED],
        datasets: listDatasets(new URL(request.url).searchParams.get('sessionId')),
        recent: datasetState.recent.map(entry => ({
          ...entry,
          exists: existsSync(entry.path),
        })),
      })),
    },
    {
      path: '/api/data-console/recent/clear',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async () => {
        datasetState.recent = []
        saveDatasetState()
        return { cleared: true }
      }),
    },
    {
      path: '/api/data-console/settings',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        if (request.method === 'GET') return { settings: effectiveSettings(), defaults: DEFAULT_SETTINGS }
        const body = await request.json()
        return { settings: saveSettings(body.settings ?? body) }
      }),
    },
    {
      path: '/api/data-console/open',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        return await openDataset(body.path, body.baseDir ?? lastDir, body.sheet, body.sessionId ?? null)
      }),
    },
    {
      path: '/api/data-console/upload',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const extension = extname(name).toLowerCase()
        if (!SUPPORTED.has(extension)) {
          throw new Error(`unsupported file type "${extension || '(none)'}"; supported: CSV, TSV, TXT, XLSX, XLSM, JSON`)
        }
        if (typeof body.data !== 'string' || body.data === '') throw new Error('file data is required')
        const buffer = Buffer.from(body.data, 'base64')
        if (buffer.length === 0) throw new Error('the file is empty')
        const limitMB = Math.min(effectiveSettings().maxFileMB, Math.round(MAX_UPLOAD_BYTES / 1048576))
        if (buffer.length > limitMB * 1048576) {
          throw new Error(`file is ${(buffer.length / 1048576).toFixed(1)} MB; the upload limit is ${limitMB} MB`)
        }
        const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
        const directory = join(UPLOAD_DIR, digest)
        mkdirSync(directory, { recursive: true })
        const target = join(directory, safeName(name))
        // Identical bytes keep their original copy (and mtime), so reopening dedupes.
        if (!existsSync(target)) writeFileSync(target, buffer)
        return await openDataset(target, undefined, null, body.sessionId ?? null)
      }),
    },
    {
      path: '/api/data-console/profile',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const params = new URL(request.url).searchParams
        const id = params.get('id') ?? undefined
        return { profile: pickDataset(id, params.get('sessionId')).profile }
      }),
    },
    {
      path: '/api/data-console/preview',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const params = new URL(request.url).searchParams
        const record = pickDataset(params.get('id') ?? undefined, params.get('sessionId'))
        await ensureDatasetLive(record)
        const offset = Number(params.get('offset') ?? 0)
        const limit = Math.min(Math.max(Number(params.get('limit') ?? 50), 1), 200)
        const sort = params.get('sort') ?? undefined
        const desc = params.get('dir') === 'desc'
        return await sidecar.call('preview', {
          dataset: record.id,
          offset,
          limit,
          sort,
          desc,
          where: params.get('where') ?? '',
        })
      }),
    },
    {
      path: '/api/data-console/query',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const record = pickDataset(body.dataset, body.sessionId ?? null)
        await ensureAllDatasetsLive()
        const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200)
        return await sidecar.call('query', {
          datasets: datasetIdsFor(record),
          sql: body.sql,
          limit,
        })
      }),
    },
    {
      path: '/api/data-console/close',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const record = pickDataset(body.dataset, body.sessionId ?? null)
        datasets.delete(record.id)
        forgetDataset(record)
        await sidecar.call('close', { dataset: record.id }).catch(() => {})
        return { closed: record.id }
      }),
    },
    {
      path: '/api/data-console/browse',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const requested = new URL(request.url).searchParams.get('dir') ?? lastDir
        const dir = resolvePath(requested, lastDir)
        if (!existsSync(dir)) throw new Error(`directory not found: ${dir}`)
        if (!statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`)
        const entries = []
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entries.length >= 400) break
          if (entry.name === 'node_modules' || entry.name === '.git') continue
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            entries.push({ name: entry.name, path: full, type: 'dir' })
          } else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase())) {
            let size = 0
            try {
              size = statSync(full).size
            } catch {
              size = 0
            }
            entries.push({ name: entry.name, path: full, type: 'file', size })
          }
        }
        entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
        const parent = dirname(dir) === dir ? null : dirname(dir)
        return { dir, parent, entries }
      }),
    },
    {
      path: '/api/data-console/chart',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const record = pickDataset(body.dataset, body.sessionId ?? null)
        await ensureDatasetLive(record)
        return await sidecar.call('chart', { dataset: record.id, spec: body.spec ?? {} }, 180_000)
      }),
    },
    {
      path: '/api/data-console/export',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const record = pickDataset(body.dataset, body.sessionId ?? null)
        return await exportDataset(record, body.format ?? 'csv', body.sql, body.path, lastDir)
      }),
    },
    {
      path: '/api/data-console/save-image',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl ?? ''))
        if (match === null) throw new Error('expected a PNG data URL')
        const buffer = Buffer.from(match[1], 'base64')
        if (buffer.length > MAX_WRITE_BYTES) throw new Error('image is larger than 20 MB')
        const target = join(lastDir, `${safeName(body.name ?? 'chart')}-${stamp()}.png`)
        mkdirSync(lastDir, { recursive: true })
        writeFileSync(target, buffer)
        return { path: target, bytes: buffer.length }
      }),
    },
    {
      path: '/api/data-console/save-text',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: route(async (request) => {
        const body = await request.json()
        const text = String(body.text ?? '')
        if (Buffer.byteLength(text) > MAX_WRITE_BYTES) throw new Error('text is larger than 20 MB')
        const extension = String(body.extension ?? 'csv').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'txt'
        const target = join(lastDir, `${safeName(body.name ?? 'export')}-${stamp()}.${extension}`)
        mkdirSync(lastDir, { recursive: true })
        writeFileSync(target, text, 'utf8')
        return { path: target, bytes: Buffer.byteLength(text) }
      }),
    },
  ]

  for (const definition of routes) {
    ctx.effect(() => ctx.connection.fetch.register(definition), `data-console: ${definition.path}`)
  }

  // Bring the previous session's datasets back in the background; a slow or
  // missing file must never delay startup or a request.
  pruneUploads()
  void restoreOpenDatasets()
}
