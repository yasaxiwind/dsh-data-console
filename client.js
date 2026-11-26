/**
 * Data console — Client half.
 *
 * A composer trigger plus a frame overlay: dataset list, column profile,
 * paginated table and SQL query surface. All data comes from the Host half over
 * the authenticated `/api/data-console/*` routes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-data-console',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React

    const NS = 'dsh-data-console'
    const PAGE_SIZE = 50
const SUPPORTED_EXT = /\.(csv|tsv|txt|xlsx|xlsm|json)$/i
const MAX_UPLOAD_MB = 100

    const zh = {
      title: '数据工作台',
      open: '数据',
      openFile: '打开文件',
      pathPlaceholder: '绝对路径，例如 D:\\data\\sensor.csv',
      openHint: '相对路径按 {base} 解析',
      dataset: '数据集',
      noDatasets: '还没有打开的数据集',
      openFirst: '先在左侧打开一个 CSV / Excel 文件',
      profile: '画像',
      table: '表格',
      sql: 'SQL',
      rows: '行',
      cols: '列',
      column: '列名',
      dtype: '类型',
      missing: '缺失',
      missingCols: '带缺失的列',
      unique: '唯一',
      range: '范围 / 高频值',
      prev: '上一页',
      next: '下一页',
      pageInfo: '第 {page} / {total} 页',
      run: '运行',
      running: '运行中…',
      sqlPlaceholder: 'SELECT * FROM data LIMIT 50',
      error: '出错',
      close: '关闭',
      refresh: '刷新',
      noPython: '没有找到带 pandas 的 Python',
      selectDataset: '选择数据集',
      delete: '移除',
      queryOk: '{n} 行 · {ms} ms',
      truncated: '（已截断）',
      loading: '加载中…',
      meta: '{rows} 行 × {cols} 列',
      tableHint: '数据来自内存中的 SQLite 副本，表名为 data',
      sheet: '工作表',
      empty: '空',
      busy: '处理中…',
      unsupported: '支持 CSV / TSV / TXT / XLSX / XLSM / JSON',
      opened: '已打开 {name} · {rows} 行',
      browse: '浏览…',
      up: '上一级',
      emptyDir: '这个文件夹里没有数据文件',
      otherSession: '其他会话',
      chart: '图表',
      chartType: '图表类型',
      chartLine: '折线',
      chartBar: '柱状',
      chartScatter: '散点',
      chartHistogram: '直方图',
      chartBox: '箱线',
      chartHeatmap: '热力',
      chartX: 'X 轴',
      chartY: 'Y 轴',
      chartValue: '数值（可选）',
      chartGroup: '分组（可选）',
      chartCols: '列（分组）',
      chartAgg: '聚合',
      chartBins: '分箱数',
      chartNone: '（无）',
      generate: '生成',
      exportCsv: '导出 CSV',
      exportPng: '导出 PNG',
      chartEmpty: '选好列后点「生成」',
      savedAt: '已保存',
      showAll: '显示全部',
      settings: '设置',
      sidebar: '停靠到侧边栏',
      sidebarShort: '侧栏',
      float: '切换为浮窗',
      floatShort: '浮窗',
      resizeSidebar: '拖动调整侧栏宽度',
      maxFileMB: '文件大小上限 (MB)',
      maxFileMBHint: '留空使用默认值 256',
      maxRows: '读入行数上限',
      maxRowsHint: '超出后只读前 N 行并提示（默认 5,000,000）',
      defaultChartType: '默认图表类型',
      defaultAgg: '默认聚合',
      pythonPath: 'Python 解释器',
      pythonPathHint: '留空自动探测；保存后重启 Python 进程',
      auto: '自动',
      save: '保存',
      cancel: '取消',
      settingsSaved: '设置已保存',
      memory: '内存',
      truncatedNote: '文件超过行数上限，只读取了前 {rows} 行。',
      filter: '筛选',
      filterPlaceholder: "筛选，例如 value > 50 and channel = 'A1'",
      apply: '应用',
      clear: '清除',
      filteredNote: '筛选后 {total} 行',
      tables: '可用表',
      primary: '主表',
      recent: '最近打开',
      clearRecent: '清空',
      fileMissing: '文件不存在',
      pickFolder: '选择文件夹',
      pickFile: '选择文件',
      dropHint: '也可以把文件直接拖进面板',
      folder: '文件夹',
      noSupportedFiles: '该文件夹里没有支持的文件',
      importing: '正在导入…',
      imported: '已导入 {name}',
      uploadUnsupported: '不支持的文件类型',
      uploadTooLarge: '文件超过 {mb} MB，请改用路径打开',
    }

    const en = {
      title: 'Data console',
      open: 'Data',
      openFile: 'Open file',
      pathPlaceholder: 'Absolute path, e.g. D:\\data\\sensor.csv',
      openHint: 'Relative paths resolve against {base}',
      dataset: 'Datasets',
      noDatasets: 'No dataset is open yet',
      openFirst: 'Open a CSV or Excel file on the left',
      profile: 'Profile',
      table: 'Table',
      sql: 'SQL',
      rows: 'rows',
      cols: 'cols',
      column: 'Column',
      dtype: 'Type',
      missing: 'Missing',
      missingCols: 'Columns with missing',
      unique: 'Unique',
      range: 'Range / top values',
      prev: 'Previous',
      next: 'Next',
      pageInfo: 'Page {page} / {total}',
      run: 'Run',
      running: 'Running…',
      sqlPlaceholder: 'SELECT * FROM data LIMIT 50',
      error: 'Error',
      close: 'Close',
      refresh: 'Refresh',
      noPython: 'No Python with pandas was found',
      selectDataset: 'Select dataset',
      delete: 'Remove',
      queryOk: '{n} row(s) · {ms} ms',
      truncated: '(truncated)',
      loading: 'Loading…',
      meta: '{rows} rows × {cols} cols',
      tableHint: 'SQL runs over an in-memory SQLite copy; the table is named data',
      sheet: 'Sheet',
      empty: 'Empty',
      busy: 'Working…',
      unsupported: 'CSV / TSV / TXT / XLSX / XLSM / JSON',
      opened: 'Opened {name} · {rows} rows',
      browse: 'Browse…',
      up: 'Up',
      emptyDir: 'No data files in this folder',
      otherSession: 'Other session',
      chart: 'Chart',
      chartType: 'Chart type',
      chartLine: 'Line',
      chartBar: 'Bar',
      chartScatter: 'Scatter',
      chartHistogram: 'Histogram',
      chartBox: 'Box',
      chartHeatmap: 'Heatmap',
      chartX: 'X axis',
      chartY: 'Y axis',
      chartValue: 'Value (optional)',
      chartGroup: 'Group by (optional)',
      chartCols: 'Column (group)',
      chartAgg: 'Aggregation',
      chartBins: 'Bins',
      chartNone: '(none)',
      generate: 'Generate',
      exportCsv: 'Export CSV',
      exportPng: 'Export PNG',
      chartEmpty: 'Choose columns, then Generate',
      savedAt: 'Saved',
      showAll: 'Show all',
      settings: 'Settings',
      sidebar: 'Dock to the right sidebar',
      sidebarShort: 'Dock',
      float: 'Switch to a floating window',
      floatShort: 'Float',
      resizeSidebar: 'Drag to resize the sidebar',
      maxFileMB: 'Max file size (MB)',
      maxFileMBHint: 'Empty uses the default, 256',
      maxRows: 'Max rows to load',
      maxRowsHint: 'Stops after N rows and says so (default 5,000,000)',
      defaultChartType: 'Default chart type',
      defaultAgg: 'Default aggregation',
      pythonPath: 'Python interpreter',
      pythonPathHint: 'Empty auto-detects; saving restarts the Python process',
      auto: 'Auto',
      save: 'Save',
      cancel: 'Cancel',
      settingsSaved: 'Settings saved',
      memory: 'Memory',
      truncatedNote: 'The file exceeds the row limit; only the first {rows} rows are loaded.',
      filter: 'Filter',
      filterPlaceholder: "Filter, e.g. value > 50 and channel = 'A1'",
      apply: 'Apply',
      clear: 'Clear',
      filteredNote: '{total} rows after filtering',
      tables: 'Tables',
      primary: 'Primary',
      recent: 'Recent',
      clearRecent: 'Clear',
      fileMissing: 'Missing',
      pickFolder: 'Pick folder',
      pickFile: 'Pick file',
      dropHint: 'You can also drop a file onto this panel',
      folder: 'Folder',
      noSupportedFiles: 'No supported files in this folder',
      importing: 'Importing…',
      imported: 'Imported {name}',
      uploadUnsupported: 'Unsupported file type',
      uploadTooLarge: 'The file is larger than {mb} MB; open it by path instead',
    }

    const LAYOUT_KEY = 'dsh-data-console:layout'
    const SIDEBAR_MIN = 280
    const SIDEBAR_MAX = 560

    /**
     * Height reserved by the desktop window controls (0 on plain web).
     * @returns {number} inset in pixels.
     */
    function titlebarInset() {
      const candidates = [document.documentElement, document.body, document.querySelector('[data-windows-titlebar]')]
      const carrier = candidates.find(element => element !== null && element.hasAttribute('data-windows-titlebar'))
      if (carrier !== undefined) {
        const raw = getComputedStyle(carrier).getPropertyValue('--dsh-windows-titlebar-height').trim()
        const pixels = Number.parseFloat(raw)
        if (Number.isFinite(pixels) && pixels > 0) return pixels
        const area = navigator.windowControlsOverlay
        if (area !== undefined && typeof area.getTitlebarAreaRect === 'function') {
          const rect = area.getTitlebarAreaRect()
          if (rect !== null && rect.height > 0) return rect.height
        }
        return 42
      }
      return 0
    }

    /**
     * Keep the docked width usable on the current viewport.
     * @param {unknown} value - candidate width.
     * @returns {number} clamped width.
     */
    function clampSidebarWidth(value) {
      const max = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(window.innerWidth * 0.5)))
      return Math.max(Math.min(SIDEBAR_MIN, max), Math.min(max, Math.round(Number(value) || 380)))
    }

    /**
     * Read the persisted dialog/sidebar layout.
     * @returns {{mode: string, x: number|null, y: number|null, width: number}} layout.
     */
    function loadLayout() {
      const fallback = { mode: 'dialog', x: null, y: null, width: 380 }
      try {
        const raw = window.localStorage.getItem(LAYOUT_KEY)
        if (raw === null) return fallback
        const parsed = JSON.parse(raw)
        return {
          mode: parsed.mode === 'sidebar' ? 'sidebar' : 'dialog',
          x: Number.isFinite(parsed.x) ? parsed.x : null,
          y: Number.isFinite(parsed.y) ? parsed.y : null,
          width: clampSidebarWidth(parsed.width),
        }
      } catch {
        return fallback
      }
    }

    /**
     * Tiny external store with a hook face.
     * @param {object} initial - initial state.
     * @returns {{use: Function, get: Function, set: Function}} the store.
     */
    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
      const use = () => useSyncExternalStore(subscribe, () => state, () => state)
      const set = (patch) => {
        state = typeof patch === 'function' ? patch(state) : { ...state, ...patch }
        for (const listener of listeners) listener()
      }
      return { use, get: () => state, set }
    }

    const store = createStore({
      open: false,
      sessionId: null,
      phase: 'idle',
      error: null,
      meta: null,
      layout: loadLayout(),
      datasets: [],
      selectedId: null,
      view: 'profile',
      profile: null,
      table: null,
      tableLoading: false,
      page: 0,
      sort: null,
      desc: false,
      filterDraft: '',
      tableWhere: '',
      filtered: false,
      query: { sql: 'SELECT * FROM data LIMIT 50', result: null, error: null, running: false },
      queryPage: 0,
      form: { path: '', busy: false, error: null },
      browser: { open: false, dir: null, parent: null, entries: [], loading: false, error: null },
      folder: { name: '', entries: [], error: null },
      dropBusy: false,
      chart: {
        spec: { type: 'line', x: '', y: '', group: '', agg: 'mean', bins: 20 },
        data: null,
        loading: false,
        error: null,
        saved: null,
        hidden: [],
      },
      settingsView: { open: false, loading: false, data: null, draft: null, defaults: null, saving: false, error: null, saved: false },
      status: null,
    })

    /**
     * Update and persist the dialog/sidebar layout.
     * @param {object} patch - layout fields to merge.
     * @returns {void}
     */
    function setLayout(patch) {
      store.set(state => ({ ...state, layout: { ...state.layout, ...patch } }))
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(store.get().layout))
      } catch {
        // Layout persistence is best effort.
      }
    }

    /**
     * Call one Host route and unwrap the { ok, ... } envelope.
     * @param {string} path - route path.
     * @param {object} [init] - fetch init.
     * @returns {Promise<object>} the response body.
     */
    async function api(path, init) {
      const response = await window.fetch(path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        ...init,
      })
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok === false) {
        const message = body?.error?.message ?? `HTTP ${response.status}`
        throw new Error(message)
      }
      return body
    }

    /**
     * Reload the dataset list from the Host.
     * @returns {Promise<object | undefined>} the fresh meta.
     */
    async function refreshMeta() {
      try {
        const sessionId = store.get().sessionId
        const suffix = sessionId === null || sessionId === '' ? '' : `?sessionId=${encodeURIComponent(sessionId)}`
        const meta = await api(`/api/data-console/meta${suffix}`)
        store.set((state) => {
          const stillThere = meta.datasets.some(entry => entry.id === state.selectedId)
          const selectedId = stillThere ? state.selectedId : (meta.datasets[0]?.id ?? null)
          return {
            ...state,
            meta,
            datasets: meta.datasets,
            selectedId,
            phase: 'ready',
            error: null,
          }
        })
        return meta
      } catch (error) {
        store.set((state) => ({ ...state, phase: 'error', error: error.message }))
        return undefined
      }
    }

    /**
     * Load the profile of one dataset.
     * @param {string} id - dataset id.
     * @returns {Promise<void>}
     */
    async function loadProfile(id) {
      if (id === null) {
        store.set((state) => ({ ...state, profile: null }))
        return
      }
      try {
        const body = await api(`/api/data-console/profile?id=${encodeURIComponent(id)}`)
        store.set((state) => (state.selectedId === id ? { ...state, profile: body.profile } : state))
        ensureChartSpec(body.profile)
      } catch (error) {
        store.set((state) => ({ ...state, status: error.message }))
      }
    }

    /**
     * Load one page of rows, optionally filtered by a SQL WHERE clause.
     * @param {string} id - dataset id.
     * @param {number} page - zero-based page.
     * @param {string | null} sort - sort column.
     * @param {boolean} desc - descending order.
     * @param {string} [where] - filter expression; omit to keep the current one.
     * @returns {Promise<void>}
     */
    async function loadTable(id, page, sort, desc, where) {
      if (id === null) return
      const filter = where === undefined ? store.get().tableWhere : where
      store.set((state) => ({
        ...state,
        tableLoading: true,
        page,
        sort: sort ?? null,
        desc: Boolean(desc),
        tableWhere: filter,
      }))
      try {
        const params = new URLSearchParams({
          id,
          offset: String(page * PAGE_SIZE),
          limit: String(PAGE_SIZE),
        })
        if (sort) {
          params.set('sort', sort)
          params.set('dir', desc ? 'desc' : 'asc')
        }
        if (filter) params.set('where', filter)
        const body = await api(`/api/data-console/preview?${params.toString()}`)
        store.set((state) => (state.selectedId === id ? { ...state, table: body, tableLoading: false, filtered: Boolean(body.filtered) } : { ...state, tableLoading: false }))
      } catch (error) {
        store.set((state) => ({ ...state, tableLoading: false, status: error.message }))
      }
    }

    /**
     * Apply an opened/uploaded dataset to the panel state.
     * @param {{ dataset: object, profile: object }} body - Host response.
     * @returns {void}
     */
    function adoptOpened(body) {
      store.set((state) => ({
        ...state,
        form: { path: '', busy: false, error: null },
        selectedId: body.dataset.id,
        profile: body.profile,
        table: null,
        page: 0,
        view: 'profile',
        filterDraft: '',
        tableWhere: '',
        filtered: false,
        settingsView: { ...state.settingsView, open: false },
        chart: {
          ...state.chart,
          data: null,
          error: null,
          saved: null,
          hidden: [],
          spec: {
            ...state.chart.spec,
            type: state.meta?.settings?.defaultChartType ?? state.chart.spec.type,
            agg: state.meta?.settings?.defaultAgg ?? state.chart.spec.agg,
            group: '',
          },
        },
        status: { key: 'opened', params: { name: body.dataset.name, rows: body.dataset.rows.toLocaleString() } },
        phase: 'ready',
      }))
      ensureChartSpec(body.profile)
    }

    /**
     * Open one dataset by path.
     * @param {string} path - path typed in the panel.
     * @returns {Promise<void>}
     */
    async function openDataset(path) {
      if (path.trim() === '') return
      store.set((state) => ({ ...state, form: { ...state.form, busy: true, error: null } }))
      try {
        const baseDir = store.get().meta?.baseDir ?? ''
        const body = await api('/api/data-console/open', {
          method: 'POST',
          body: JSON.stringify({ path, baseDir, sessionId: store.get().sessionId }),
        })
        adoptOpened(body)
        await refreshMeta()
      } catch (error) {
        store.set((state) => ({ ...state, form: { ...state.form, busy: false, error: error.message } }))
      }
    }

    /**
     * List one directory in the picker.
     * @param {string} dir - absolute directory, or an empty string for the Host default.
     * @returns {Promise<void>}
     */
    async function browseTo(dir) {
      store.set((state) => ({ ...state, browser: { ...state.browser, open: true, loading: true, error: null } }))
      try {
        const body = await api(`/api/data-console/browse?dir=${encodeURIComponent(dir === null || dir === undefined ? '' : dir)}`)
        store.set((state) => ({
          ...state,
          browser: { open: true, dir: body.dir, parent: body.parent, entries: body.entries, loading: false, error: null },
        }))
      } catch (error) {
        store.set((state) => ({ ...state, browser: { ...state.browser, loading: false, error: error.message } }))
      }
    }

    /** Close the picker. */
    function closeBrowser() {
      store.set((state) => ({ ...state, browser: { ...state.browser, open: false, error: null } }))
    }

    /** Toggle the picker, starting from the Host base directory. */
    function toggleBrowser() {
      const state = store.get()
      if (state.browser.open) {
        closeBrowser()
        return
      }
      void browseTo(state.meta?.baseDir ?? '')
    }

    /**
     * @param {number} bytes - file size.
     * @returns {string} a short human size.
     */
    function formatSize(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
      return `${(bytes / 1048576).toFixed(1)} MB`
    }

    /**
     * Pick usable default axes for a profile without overwriting valid choices.
     * @param {object | null} profile - column profile.
     * @returns {void}
     */
    function ensureChartSpec(profile) {
      if (profile === null || profile === undefined) return
      const columns = profile.columns ?? []
      const names = columns.map(column => column.name)
      if (names.length === 0) return
      const numeric = columns.filter(column => /int|float|decimal|number/i.test(String(column.dtype))).map(column => column.name)
      const time = columns.find(column => /datetime/i.test(String(column.dtype)))
      const current = store.get().chart.spec
      const categorical = columns.filter(column => (
        column.unique !== null && column.unique !== undefined && column.unique > 1 && column.unique <= 30
        && !/int|float|decimal|number|datetime/i.test(String(column.dtype))
      )).map(column => column.name)
      const x = names.includes(current.x)
        ? current.x
        : (categorical[0] ?? (time !== undefined ? time.name : names[0]))
      const y = numeric.includes(current.y) && current.y !== x
        ? current.y
        : (numeric.find(name => name !== x) ?? '')
      const group = names.includes(current.group) ? current.group : ''
      if (x !== current.x || y !== current.y || group !== current.group) {
        store.set(state => ({ ...state, chart: { ...state.chart, spec: { ...state.chart.spec, x, y, group } } }))
      }
    }

    /**
     * Update one chart-spec field.
     * @param {object} patch - fields to merge.
     * @returns {void}
     */
    function setChartSpec(patch) {
      store.set(state => ({ ...state, chart: { ...state.chart, spec: { ...state.chart.spec, ...patch } } }))
    }

    /**
     * Hide or show one chart series; `null` shows all.
     * @param {string | null} name - series name.
     * @returns {void}
     */
    function toggleSeries(name) {
      store.set((state) => {
        const hidden = new Set(state.chart.hidden ?? [])
        if (name === null) hidden.clear()
        else if (hidden.has(name)) hidden.delete(name)
        else hidden.add(name)
        return { ...state, chart: { ...state.chart, hidden: [...hidden] } }
      })
    }

    /**
     * Ask the Host for chart data for the current dataset.
     * @returns {Promise<void>}
     */
    async function generateChart() {
      const state = store.get()
      if (state.selectedId === null) return
      store.set(current => ({ ...current, chart: { ...current.chart, loading: true, error: null, saved: null, hidden: [] } }))
      try {
        const data = await api('/api/data-console/chart', {
          method: 'POST',
          body: JSON.stringify({
            dataset: state.selectedId,
            sessionId: state.sessionId,
            spec: store.get().chart.spec,
          }),
        })
        store.set(current => ({ ...current, chart: { ...current.chart, loading: false, data, error: null } }))
      } catch (error) {
        store.set(current => ({ ...current, chart: { ...current.chart, loading: false, error: error.message, data: null } }))
      }
    }

    /**
     * Serialize chart data as long-format CSV.
     * @param {object} data - chart payload.
     * @returns {string} the CSV text.
     */
    function chartCsv(data) {
      const rows = []
      if (data.kind === 'box') {
        rows.push(['name', 'min', 'q1', 'median', 'q3', 'max', 'count'])
        for (const box of data.boxes) rows.push([box.name, box.min, box.q1, box.median, box.q3, box.max, box.count])
      } else if (data.kind === 'heatmap') {
        rows.push(['row', ...data.cols])
        data.rows.forEach((row, index) => rows.push([row, ...data.values[index]]))
      } else {
        rows.push(['series', 'x', 'y'])
        for (const series of data.series) {
          for (const point of series.points) rows.push([series.name, point.x, point.y])
        }
      }
      const escape = (value) => {
        const text = value === null || value === undefined ? '' : String(value)
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }
      return rows.map(row => row.map(escape).join(',')).join('\n')
    }

    /**
     * Render the chart's SVG to a PNG data URL.
     * @param {SVGSVGElement} svg - live chart node.
     * @returns {Promise<string>} the PNG data URL.
     */
    async function svgToPng(svg) {
      const clone = svg.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const xml = new XMLSerializer().serializeToString(clone)
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const image = new Image()
        await new Promise((resolveImage, rejectImage) => {
          image.onload = resolveImage
          image.onerror = () => rejectImage(new Error('could not rasterize the chart'))
          image.src = url
        })
        const scale = 2
        const width = (svg.viewBox?.baseVal?.width ?? 760) * scale
        const height = (svg.viewBox?.baseVal?.height ?? 360) * scale
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        return canvas.toDataURL('image/png')
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    /**
     * Save the current chart as a CSV file in the last folder.
     * @returns {Promise<void>}
     */
    async function saveChartCsv() {      const state = store.get()
      if (state.chart.data === null) return
      const dataset = state.datasets.find(entry => entry.id === state.selectedId)
      const name = `${(dataset?.name ?? 'chart').replace(/\.[^.]+$/, '')}-${state.chart.data.kind}`
      try {
        const body = await api('/api/data-console/save-text', {
          method: 'POST',
          body: JSON.stringify({ name, text: chartCsv(state.chart.data), extension: 'csv' }),
        })
        store.set(current => ({ ...current, chart: { ...current.chart, saved: body.path } }))
      } catch (error) {
        store.set(current => ({ ...current, chart: { ...current.chart, error: error.message } }))
      }
    }

    /**
     * Save the rendered SVG as a PNG file in the last folder.
     * @param {SVGSVGElement | null} svg - live chart node.
     * @returns {Promise<void>}
     */
    async function saveChartPng(svg) {
      if (svg === null || svg === undefined) return
      const state = store.get()
      const dataset = state.datasets.find(entry => entry.id === state.selectedId)
      const name = `${(dataset?.name ?? 'chart').replace(/\.[^.]+$/, '')}-${state.chart.data?.kind ?? 'chart'}`
      try {
        const dataUrl = await svgToPng(svg)
        const body = await api('/api/data-console/save-image', {
          method: 'POST',
          body: JSON.stringify({ name, dataUrl }),
        })
        store.set(current => ({ ...current, chart: { ...current.chart, saved: body.path } }))
      } catch (error) {
        store.set(current => ({ ...current, chart: { ...current.chart, error: error.message } }))
      }
    }

    /**
     * Remove one dataset from the Host registry.
     * @param {string} id - dataset id.
     * @returns {Promise<void>}
     */
    async function closeDataset(id) {
      try {
        await api('/api/data-console/close', { method: 'POST', body: JSON.stringify({ dataset: id }) })
      } catch {
        // A vanished dataset is already closed.
      }
      const meta = await refreshMeta()
      if (meta?.datasets.length === 0) {
        store.set((state) => ({ ...state, profile: null, table: null, selectedId: null }))
      } else {
        await loadProfile(store.get().selectedId)
      }
    }

    /**
     * Clear the recent-files list on the Host.
     * @returns {Promise<void>}
     */
    async function clearRecent() {
      try {
        await api('/api/data-console/recent/clear', { method: 'POST', body: JSON.stringify({}) })
        await refreshMeta()
      } catch (error) {
        store.set((state) => ({ ...state, status: error.message }))
      }
    }

    /**
     * @param {number} ms - epoch milliseconds.
     * @returns {string} a short local date/time label.
     */
    function formatRecentTime(ms) {
      const date = new Date(Number(ms))
      if (Number.isNaN(date.getTime())) return ''
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * Encode bytes as base64 without a giant spread call.
     * @param {ArrayBuffer} buffer - file bytes.
     * @returns {string} base64 text.
     */
    function toBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
      }
      return btoa(binary)
    }

    /**
     * Upload one browser File to the Host and open the resulting dataset.
     * @param {File} file - dropped or selected file.
     * @returns {Promise<void>}
     */
    async function uploadFile(file) {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        store.set(state => ({ ...state, status: t('uploadTooLarge', { mb: MAX_UPLOAD_MB }) }))
        return
      }
      store.set(state => ({ ...state, dropBusy: true, status: { key: 'importing', params: { name: file.name } } }))
      try {
        const buffer = await file.arrayBuffer()
        const body = await api('/api/data-console/upload', {
          method: 'POST',
          body: JSON.stringify({
            name: file.name,
            data: toBase64(buffer),
            sessionId: store.get().sessionId,
          }),
        })
        adoptOpened(body)
        await refreshMeta()
        store.set(state => ({
          ...state,
          dropBusy: false,
          status: { key: 'imported', params: { name: body.dataset.name } },
        }))
      } catch (error) {
        store.set(state => ({ ...state, dropBusy: false, status: error.message }))
      }
    }

    /**
     * Import the first supported file of a drop or picker selection.
     * @param {FileList | File[] | null} files - dropped files.
     * @returns {Promise<void>}
     */
    async function importFiles(files) {
      const list = Array.from(files ?? [])
      const file = list.find(entry => SUPPORTED_EXT.test(entry.name))
      if (file === undefined) {
        if (list.length > 0) store.set(state => ({ ...state, status: t('uploadUnsupported') }))
        return
      }
      await uploadFile(file)
    }

    /**
     * Remember the files of a picked folder for the sidebar list.
     * @param {FileList} files - files from a webkitdirectory input.
     * @returns {void}
     */
    function setFolder(files) {
      const list = Array.from(files ?? [])
      if (list.length === 0) return
      const root = String(list[0].webkitRelativePath ?? '').split('/')[0] || list[0].name
      const entries = list
        .filter(file => SUPPORTED_EXT.test(file.name))
        .map((file) => {
          const parts = String(file.webkitRelativePath ?? file.name).split('/')
          return { file, name: file.name, path: parts.slice(1).join('/') || file.name, size: file.size }
        })
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, 800)
      store.set(state => ({
        ...state,
        folder: { name: root, entries, error: entries.length === 0 ? 'noSupported' : null },
      }))
    }

    /**
     * Show the OS folder picker; the chosen folder's files list in the sidebar.
     * @returns {void}
     */
    function pickFolder() {
      const input = document.createElement('input')
      input.type = 'file'
      input.webkitdirectory = true
      input.multiple = true
      input.addEventListener('change', () => setFolder(input.files), { once: true })
      input.click()
    }

    /**
     * Show the OS file picker and open the chosen file.
     * @returns {void}
     */
    function pickFile() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv,.tsv,.txt,.xlsx,.xlsm,.json'
      input.addEventListener('change', () => { void importFiles(input.files) }, { once: true })
      input.click()
    }

    /**
     * Run the SQL currently in the editor.
     * @returns {Promise<void>}
     */
    async function runQuery() {
      const id = store.get().selectedId
      const sql = store.get().query.sql
      if (id === null || sql.trim() === '') return
      store.set((state) => ({ ...state, query: { ...state.query, running: true, error: null } }))
      try {
        const body = await api('/api/data-console/query', {
          method: 'POST',
          body: JSON.stringify({ dataset: id, sql, limit: 200 }),
        })
        store.set((state) => ({ ...state, queryPage: 0, query: { ...state.query, running: false, result: body, error: null } }))
      } catch (error) {
        store.set((state) => ({ ...state, query: { ...state.query, running: false, error: error.message, result: null } }))
      }
    }

    /**
     * Select a dataset and show its profile.
     * @param {string} id - dataset id.
     * @returns {void}
     */
    function selectDataset(id) {
      store.set((state) => ({
        ...state,
        selectedId: id,
        profile: null,
        table: null,
        page: 0,
        view: 'profile',
        status: null,
        filterDraft: '',
        tableWhere: '',
        filtered: false,
        settingsView: { ...state.settingsView, open: false },
        chart: {
          ...state.chart,
          data: null,
          error: null,
          saved: null,
          hidden: [],
          spec: {
            ...state.chart.spec,
            type: state.meta?.settings?.defaultChartType ?? state.chart.spec.type,
            agg: state.meta?.settings?.defaultAgg ?? state.chart.spec.agg,
            group: '',
          },
        },
      }))
      void loadProfile(id)
    }

    // ------------------------------------------------------------- styling

    const CSS = [
      '.dc-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));',
      'border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6472);font:inherit;font-size:12px;cursor:pointer}',
      '.dc-trigger:hover{color:var(--dsw-alias-label-primary,#161616);background:var(--dsw-alias-bg-layer-2)}',
      '.dc-trigger:focus-visible{outline:2px solid var(--dsw-alias-link,#4d6bfe);outline-offset:2px}',
      '.dc-backdrop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;',
      'background:var(--dsw-alias-bg-mask-3,rgba(15,23,42,.48))}',
      '.dc-panel{width:min(1180px,96vw);height:min(780px,88vh);display:flex;flex-direction:column;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary,#161616);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));',
      'border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.28);font-size:13px}',
      '.dc-panel,.dc-panel *{-webkit-app-region:no-drag}',
      '.dc-panel.dc-floating{position:fixed;margin:0;z-index:71}',
      '.dc-panel.dc-sidebar{position:fixed;top:0;right:0;bottom:0;width:380px;height:auto;max-height:100vh;',
      'border-radius:14px 0 0 14px;box-shadow:-18px 0 50px rgba(0,0,0,.2);z-index:71}',
      '.dc-panel.dc-dragging{user-select:none;transition:none}',
      '.dc-panel.dc-near-right{box-shadow:0 0 0 3px rgba(77,107,254,.5),0 24px 80px rgba(0,0,0,.28)}',
      '.dc-backdrop.dc-backdrop-sidebar{background:transparent;pointer-events:none;padding:0}',
      '.dc-backdrop.dc-backdrop-sidebar .dc-panel{pointer-events:auto}',
      '.dc-sidebar-resizer{position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:2}',
      '.dc-sidebar-resizer:hover{background:var(--dsw-alias-link,#4d6bfe);opacity:.4}',
      '.dc-panel.dc-sidebar .dc-head{padding:10px 12px;gap:8px}',
      '.dc-panel.dc-sidebar .dc-headmeta{display:none}',
      '.dc-panel.dc-sidebar .dc-body{flex-direction:column}',
      '.dc-panel.dc-sidebar .dc-tabs{padding:6px 8px 0;overflow-x:auto}',
      '.dc-panel.dc-sidebar .dc-tab{padding:0 9px}',
      '.dc-panel.dc-sidebar .dc-content{padding:10px 12px}',
      '.dc-panel.dc-sidebar .dc-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '.dc-panel.dc-sidebar .dc-card{padding:8px 10px}',
      '.dc-panel.dc-sidebar{container-type:inline-size}',
      '@container (max-width: 360px){.dc-title{display:none}.dc-head{gap:6px;padding:8px 10px}}',
      '.dc-sidebar-tools{display:flex;align-items:center;gap:6px;padding:8px 10px;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}',
      '.dc-sidebar-select{flex:1;min-width:0}',
      '@media (max-width:900px){.dc-panel.dc-sidebar{width:100vw !important;border-radius:0;box-shadow:none}}',
      '.dc-head{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:grab;user-select:none;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}',
      '.dc-panel.dc-dragging .dc-head{cursor:grabbing}',
      '.dc-title{font-size:14px;font-weight:600;margin:0}',
      '.dc-headmeta{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dc-spacer{flex:1}',
      '.dc-btn{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));',
      'background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}',
      '.dc-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dc-btn:disabled{opacity:.5;cursor:default}',
      '.dc-btn.primary{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.dc-body{display:flex;flex:1;min-height:0}',
      '.dc-side{width:270px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));',
      'background:var(--dsw-alias-bg-layer-2)}',
      '.dc-sidelabel{padding:10px 12px 6px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-datasets{flex:1;overflow:auto;padding:0 8px 8px}',
      '.dc-dataset{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:8px;',
      'background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}',
      '.dc-dataset:hover{background:var(--dsw-alias-bg-layer-3)}',
      '.dc-dataset[data-active="true"]{background:var(--dsw-alias-bg-layer-3);box-shadow:inset 0 0 0 1px var(--dsw-alias-link,#4d6bfe)}',
      '.dc-dsname{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dc-dsmeta{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-open{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
      '.dc-input{width:100%;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));',
      'background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;box-sizing:border-box}',
      '.dc-hint{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dc-err{color:var(--dsw-alias-state-error-primary,#c0392b);font-size:12px}',
      '.dc-main{flex:1;display:flex;flex-direction:column;min-width:0}',
      '.dc-tabs{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}',
      '.dc-tab{height:30px;padding:0 12px;border:none;border-radius:8px 8px 0 0;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);',
      'font:inherit;font-size:12.5px;cursor:pointer}',
      '.dc-tab[data-active="true"]{color:var(--dsw-alias-label-primary,#161616);background:var(--dsw-alias-bg-layer-2);font-weight:600}',
      '.dc-content{flex:1;overflow:auto;padding:14px 16px}',
      '.dc-cards{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}',
      '.dc-card{min-width:110px;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));',
      'background:var(--dsw-alias-bg-layer-2)}',
      '.dc-cardv{font-size:18px;font-weight:600}',
      '.dc-cardl{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-tablewrap{overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));border-radius:10px;max-height:100%}',
      'table.dc-table{width:100%;border-collapse:collapse;font-size:12px}',
      'table.dc-table th,table.dc-table td{padding:6px 10px;text-align:left;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));white-space:nowrap}',
      'table.dc-table th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);font-weight:600;z-index:1}',
      'table.dc-table td.dc-num{text-align:right;font-variant-numeric:tabular-nums}',
      'table.dc-table td.dc-null{color:var(--dsw-alias-label-secondary,#9aa1ab)}',
      'table.dc-table th.dc-sortable{cursor:pointer;user-select:none}',
      'table.dc-table th.dc-sortable:hover{color:var(--dsw-alias-link,#4d6bfe)}',
      '.dc-sortmark{font-size:9px;margin-left:4px;opacity:.75}',
      '.dc-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}',
      '.dc-status{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-empty{padding:40px 12px;text-align:center;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-sqlbox{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}',
      '.dc-sql{width:100%;min-height:84px;padding:10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));',
      'background:var(--dsw-alias-bg-layer-1);color:inherit;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;resize:vertical;box-sizing:border-box}',
      '.dc-banner{margin:0 0 10px;padding:8px 10px;border-radius:8px;background:rgba(192,57,43,.08);color:var(--dsw-alias-state-error-primary,#c0392b);font-size:12px;white-space:pre-wrap}',
      '.dc-note{margin:0 0 10px;padding:7px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-secondary,#5b6472);font-size:12px}',
      '.dc-browser{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px;overflow:hidden;margin-top:2px}',
      '.dc-browserhead{display:flex;align-items:center;gap:6px;padding:6px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '.dc-browserdir{flex:1;font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dc-browserlist{max-height:190px;overflow:auto;padding:4px}',
      '.dc-browserrow{display:flex;align-items:center;gap:8px;width:100%;padding:5px 6px;border:none;border-radius:6px;background:transparent;',
      'color:inherit;font:inherit;font-size:12px;cursor:pointer;text-align:left}',
      '.dc-browserrow:hover{background:var(--dsw-alias-bg-layer-3)}',
      '.dc-browsericon{width:16px;flex:none;text-align:center}',
      '.dc-browsername{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dc-browsersize{font-size:10px;color:var(--dsw-alias-label-secondary,#9aa1ab)}',
      '.dc-openrow{display:flex;gap:6px}',
      '.dc-openrow .dc-btn.primary{flex:1}',
      '.dc-chartform{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;margin-bottom:12px}',
      '.dc-field{display:flex;flex-direction:column;gap:3px}',
      '.dc-fieldlabel{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-select{height:28px;padding:0 6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));',
      'background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;min-width:100px;box-sizing:border-box}',
      '.dc-chartactions{display:flex;gap:6px;margin-left:auto;align-items:center}',
      '.dc-chartbox{margin-top:4px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));border-radius:10px;padding:8px;',
      'background:var(--dsw-alias-bg-layer-1);overflow:auto}',
      '.dc-chartbox svg text[fill="#374151"]{fill:var(--dsw-alias-label-primary)}',
      '.dc-chartbox svg text[fill="#4b5563"],.dc-chartbox svg text[fill="#6b7280"]{fill:var(--dsw-alias-label-secondary)}',
      '.dc-chartbox svg line[stroke="#e5e7eb"]{stroke:var(--dsw-alias-border-l1)}',
      '.dc-chartbox svg line[stroke="#9ca3af"]{stroke:var(--dsw-alias-border-l2)}',
      '.dc-chartbox svg line[stroke="#6b7280"]{stroke:var(--dsw-alias-label-secondary)}',
      '.dc-settings{max-width:680px}',
      '.dc-settingstitle{font-size:14px;margin:0 0 14px}',
      '.dc-settingsrow{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}',
      '.dc-settingslabel{width:150px;flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);padding-top:6px}',
      '.dc-settingscontrol{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dc-settingscontrol .dc-input,.dc-settingscontrol .dc-select{max-width:240px}',
      '.dc-filters{display:flex;gap:6px;align-items:center;margin:2px 0 8px}',
      '.dc-filters .dc-input{flex:1}',
      '.dc-sqlhint{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;margin:-2px 0 8px}',
      '.dc-pillbtn{cursor:pointer;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:transparent}',
      '.dc-recent{margin-top:14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));padding-top:8px}',
      '.dc-recenthead{display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px;',
      'color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-recentrow{display:flex;justify-content:space-between;gap:6px;width:100%;border:0;background:transparent;',
      'text-align:left;padding:4px 2px;border-radius:6px;cursor:pointer;font:inherit;font-size:11px;color:inherit}',
      '.dc-recentrow:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dc-recentrow:disabled{opacity:.45;cursor:default}',
      '.dc-recentname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dc-recenttime{flex:none;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-linkbtn{border:0;background:transparent;color:var(--dsw-alias-link,#4d6bfe);font:inherit;font-size:11px;cursor:pointer;padding:0}',
      '.dc-folder{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));padding-top:8px}',
      '.dc-folderhead{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);margin-bottom:4px;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.dc-folderlist{max-height:170px;overflow:auto;display:flex;flex-direction:column;gap:2px}',
      '.dc-folderrow{display:flex;justify-content:space-between;gap:6px;border:0;background:transparent;font:inherit;',
      'font-size:11px;color:inherit;text-align:left;padding:3px 2px;border-radius:5px;cursor:pointer}',
      '.dc-folderrow:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dc-folderrow:disabled{opacity:.5;cursor:default}',
      '.dc-folderpath{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dc-foldersize{flex:none;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-tag{margin-left:6px;font-size:10px;color:var(--dsw-alias-state-warn-primary,#b45309);background:rgba(180,83,9,.1);padding:1px 5px;border-radius:999px}',
      '.dc-pill{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:11px;',
      'background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dc-input::placeholder,.dc-sql::placeholder{color:var(--dsw-alias-label-tertiary,#9aa1ab);opacity:1}',
      'body[data-ds-dark-theme] .dc-tag{background:rgba(245,158,11,.16);color:#fbbf24}',
      'body[data-ds-dark-theme] .dc-banner{background:rgba(239,68,68,.16);color:#fca5a5}',
      '@media (max-width:760px){.dc-panel{height:94vh}.dc-side{width:190px}.dc-content{padding:10px}}',
    ].join('')

    /** @returns {object} the style element. */
    function Styles() {
      return h('style', null, CSS)
    }

    /**
     * Small table/grid glyph.
     * @param {object} props - `size` edge length.
     * @returns {object} the svg element.
     */
    function GridIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M2 6.4h12M6.2 6.4V13', stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.8 }),
      h('rect', { x: 8.4, y: 8, width: 4.4, height: 2.6, rx: 0.8, fill: 'currentColor', opacity: 0.85 }))
    }

    /**
     * Composer-row trigger.
     * @param {object} props - injected open action and translator.
     * @returns {object} the button.
     */
    function Trigger(props) {
      const { open, t, sessionId } = props
      return h(React.Fragment, null,
        h(Styles),
        h('button', {
          type: 'button',
          className: 'dc-trigger',
          title: t('title'),
          'aria-haspopup': 'dialog',
          onClick: () => open(sessionId ?? null),
        }, h(GridIcon, { size: 14 }), h('span', null, t('open'))))
    }

    /**
     * Format one cell for display.
     * @param {unknown} value - cell value.
     * @returns {string} display text.
     */
    function display(value) {
      if (value === null || value === undefined) return '—'
      if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
      const text = String(value)
      return text.length > 120 ? `${text.slice(0, 119)}…` : text
    }

    /**
     * Render a data grid.
     * @param {object} props - columns, rows and numeric-column hints.
     * @returns {object} the table element.
     */
    function Grid({ columns, rows, sort, desc, onSort }) {
      const numeric = useMemo(() => columns.map((_, index) => (
        rows.length > 0 && rows.slice(0, 20).every(row => row[index] === null || typeof row[index] === 'number')
      )), [columns, rows])
      return h('div', { className: 'dc-tablewrap' },
        h('table', { className: 'dc-table' },
          h('thead', null, h('tr', null, columns.map((column, index) => h('th', {
            key: `${column}-${index}`,
            className: onSort === undefined ? undefined : 'dc-sortable',
            onClick: onSort === undefined ? undefined : () => onSort(String(column)),
          },
          h('span', null, String(column)),
          onSort !== undefined && sort === String(column)
            ? h('span', { className: 'dc-sortmark' }, desc ? '▼' : '▲')
            : null)))),
          h('tbody', null, rows.length === 0
            ? h('tr', null, h('td', { colSpan: Math.max(1, columns.length), className: 'dc-empty' }, '—'))
            : rows.map((row, rowIndex) => h('tr', { key: rowIndex }, row.map((cell, cellIndex) => h('td', {
              key: cellIndex,
              className: cell === null || cell === undefined ? 'dc-null' : (numeric[cellIndex] ? 'dc-num' : undefined),
            }, display(cell))))))))
    }

    /**
     * Profile view: summary cards plus the per-column table.
     * @param {object} props - profile and translator.
     * @returns {object} the section.
     */
    function ProfileView({ profile, dataset, t }) {
      if (profile === null) return h('div', { className: 'dc-empty' }, t('loading'))
      const rows = profile.columns.map((column) => {
        let extra = ''
        if (column.min !== undefined && column.max !== undefined) extra = `${display(column.min)} … ${display(column.max)}`
        else if (Array.isArray(column.top) && column.top.length > 0) {
          extra = column.top.slice(0, 3).map(entry => `${display(entry.value)} (${entry.count})`).join('  ')
        }
        return [column.name, column.dtype, column.missing, column.unique ?? '—', extra]
      })
      return h('div', null,
        h('div', { className: 'dc-cards' },
          h('div', { className: 'dc-card' }, h('div', { className: 'dc-cardv' }, profile.rows.toLocaleString()), h('div', { className: 'dc-cardl' }, t('rows'))),
          h('div', { className: 'dc-card' }, h('div', { className: 'dc-cardv' }, String(profile.cols)), h('div', { className: 'dc-cardl' }, t('cols'))),
          h('div', { className: 'dc-card' },
            h('div', { className: 'dc-cardv' }, String(profile.columns.filter(column => column.missing > 0).length)),
            h('div', { className: 'dc-cardl' }, t('missingCols'))),
          dataset !== null && dataset !== undefined && dataset.memoryBytes > 0
            ? h('div', { className: 'dc-card' },
              h('div', { className: 'dc-cardv' }, formatSize(dataset.memoryBytes)),
              h('div', { className: 'dc-cardl' }, t('memory')))
            : null),
        dataset !== null && dataset !== undefined && dataset.truncated === true
          ? h('div', { className: 'dc-note' }, t('truncatedNote', { rows: profile.rows.toLocaleString() }))
          : null,
        h(Grid, { columns: [t('column'), t('dtype'), t('missing'), t('unique'), t('range')], rows }))
    }

    /**
     * Paginated table view with an optional SQL WHERE filter.
     * @param {object} props - table page, filter state, actions and translator.
     * @returns {object} the section.
     */
    function TableView({ table, loading, page, sort, desc, filterDraft, appliedFilter, filtered, onFilter, onApplyFilter, onClearFilter, onPrev, onNext, onSort, t }) {
      if (table === null) return h('div', { className: 'dc-empty' }, loading ? t('loading') : t('openFirst'))
      const totalPages = Math.max(1, Math.ceil((table.total ?? 0) / PAGE_SIZE))
      return h('div', null,
        h('div', { className: 'dc-filters' },
          h('input', {
            className: 'dc-input',
            type: 'text',
            value: filterDraft,
            placeholder: t('filterPlaceholder'),
            onChange: event => onFilter(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') onApplyFilter()
            },
          }),
          h('button', { type: 'button', className: 'dc-btn primary', disabled: loading, onClick: onApplyFilter }, t('apply')),
          h('button', {
            type: 'button',
            className: 'dc-btn',
            disabled: loading || (filterDraft === '' && appliedFilter === ''),
            onClick: onClearFilter,
          }, t('clear'))),
        filtered ? h('div', { className: 'dc-note' }, t('filteredNote', { total: (table.total ?? 0).toLocaleString() })) : null,
        h('div', { className: 'dc-toolbar' },
          h('button', { type: 'button', className: 'dc-btn', disabled: page <= 0 || loading, onClick: onPrev }, t('prev')),
          h('button', { type: 'button', className: 'dc-btn', disabled: page + 1 >= totalPages || loading, onClick: onNext }, t('next')),
          h('span', { className: 'dc-status' }, t('pageInfo', { page: page + 1, total: totalPages })),
          h('span', { className: 'dc-spacer' }),
          h('span', { className: 'dc-pill' }, `${(table.total ?? 0).toLocaleString()} ${t('rows')}`)),
        h(Grid, { columns: table.columns ?? [], rows: table.rows ?? [], sort, desc, onSort }))
    }

    /**
     * SQL view.
     * @param {object} props - query state, tables, editor, run action and result paging.
     * @returns {object} the section.
     */
    function QueryView({ query, tables, page, onPrev, onNext, onSql, onRun, t }) {
      const allRows = query.result?.rows ?? []
      const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
      const current = Math.min(page, totalPages - 1)
      const visibleRows = allRows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
      return h('div', null,
        h('div', { className: 'dc-sqlbox' },
          h('textarea', {
            className: 'dc-sql',
            value: query.sql,
            spellCheck: false,
            placeholder: t('sqlPlaceholder'),
            onChange: event => onSql(event.target.value),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                onRun()
              }
            },
          }),
          h('div', { className: 'dc-toolbar' },
            h('button', { type: 'button', className: 'dc-btn primary', disabled: query.running, onClick: onRun },
              query.running ? t('running') : t('run')),
            h('span', { className: 'dc-status' }, t('tableHint')))),
        tables.length > 1
          ? h('div', { className: 'dc-sqlhint' },
            h('span', null, `${t('tables')}: `),
            tables.map(table => h('button', {
              key: table.id,
              type: 'button',
              className: 'dc-pill dc-pillbtn',
              title: table.name,
              onClick: () => onSql(`${query.sql.trim()} ${table.primary ? 'data' : table.id} `.trimStart()),
            }, table.primary ? `${t('primary')} data` : table.id)))
          : null,
        query.error !== null ? h('div', { className: 'dc-banner' }, query.error) : null,
        query.result !== null
          ? h('div', null,
            h('div', { className: 'dc-toolbar' },
              h('span', { className: 'dc-pill' }, t('queryOk', { n: query.result.returned ?? allRows.length, ms: query.result.ms ?? 0 })),
              query.result.truncated ? h('span', { className: 'dc-pill' }, t('truncated')) : null,
              totalPages > 1
                ? h(React.Fragment, null,
                  h('button', { type: 'button', className: 'dc-btn', disabled: current <= 0, onClick: onPrev }, t('prev')),
                  h('button', { type: 'button', className: 'dc-btn', disabled: current + 1 >= totalPages, onClick: onNext }, t('next')),
                  h('span', { className: 'dc-status' }, t('pageInfo', { page: current + 1, total: totalPages })))
                : null),
            h(Grid, { columns: query.result.columns ?? [], rows: visibleRows }))
          : null)
    }

    /**
     * Load the Host settings into the settings view.
     * @returns {Promise<void>}
     */
    async function openSettings() {
      store.set(state => ({
        ...state,
        settingsView: { ...state.settingsView, open: true, loading: true, error: null, saved: false },
      }))
      try {
        const body = await api('/api/data-console/settings')
        store.set(state => ({
          ...state,
          settingsView: {
            open: true,
            loading: false,
            saving: false,
            error: null,
            saved: false,
            data: body.settings,
            defaults: body.defaults,
            draft: {
              ...body.settings,
              maxFileMB: String(body.settings.maxFileMB),
              maxRows: String(body.settings.maxRows),
            },
          },
        }))
      } catch (error) {
        store.set(state => ({ ...state, settingsView: { ...state.settingsView, loading: false, error: error.message } }))
      }
    }

    /**
     * Update one settings field in the draft.
     * @param {object} patch - fields to merge.
     * @returns {void}
     */
    function setSettingsDraft(patch) {
      store.set(state => ({
        ...state,
        settingsView: { ...state.settingsView, draft: { ...state.settingsView.draft, ...patch }, saved: false },
      }))
    }

    /**
     * Persist the settings draft.
     * @returns {Promise<void>}
     */
    async function saveSettings() {
      const view = store.get().settingsView
      if (view.draft === null) return
      const payload = {
        ...view.draft,
        maxFileMB: Number(view.draft.maxFileMB) || 0,
        maxRows: Number(view.draft.maxRows) || 0,
      }
      store.set(state => ({ ...state, settingsView: { ...state.settingsView, saving: true, error: null } }))
      try {
        const body = await api('/api/data-console/settings', { method: 'POST', body: JSON.stringify({ settings: payload }) })
        store.set(state => ({
          ...state,
          settingsView: {
            ...state.settingsView,
            saving: false,
            saved: true,
            error: null,
            data: body.settings,
            draft: {
              ...body.settings,
              maxFileMB: String(body.settings.maxFileMB),
              maxRows: String(body.settings.maxRows),
            },
          },
        }))
        await refreshMeta()
      } catch (error) {
        store.set(state => ({ ...state, settingsView: { ...state.settingsView, saving: false, error: error.message } }))
      }
    }

    /** Close the settings view. */
    function closeSettings() {
      store.set(state => ({ ...state, settingsView: { ...state.settingsView, open: false, saved: false, error: null } }))
    }

    const PALETTE = ['#4d6bfe', '#e8618c', '#f2a03d', '#2bb3a3', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#64748b']

    /**
     * @param {unknown} value - numeric value.
     * @returns {string} a compact axis label.
     */
    function formatNumber(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      const abs = Math.abs(value)
      if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
      if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
      if (abs >= 1e4) return `${(value / 1e3).toFixed(0)}k`
      if (abs >= 100) return String(Math.round(value))
      if (abs >= 1) return String(Math.round(value * 10) / 10)
      return String(Math.round(value * 1000) / 1000)
    }

    /**
     * @param {string} iso - ISO timestamp.
     * @returns {string} a short date/time label.
     */
    function formatTimeLabel(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso)
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * @param {unknown} value - axis value.
     * @returns {string} a readable axis label.
     */
    function axisLabel(value) {
      if (value === null || value === undefined) return '—'
      if (typeof value === 'number') return formatNumber(value)
      return String(value)
    }

    /**
     * @param {number} min - domain start.
     * @param {number} max - domain end.
     * @param {number} count - approximate tick count.
     * @returns {number[]} nice ticks.
     */
    function niceTicks(min, max, count) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min, max]
      const span = max - min
      const rough = span / Math.max(2, count)
      const power = Math.pow(10, Math.floor(Math.log10(rough)))
      const error = rough / power
      const mult = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1
      const step = power * mult
      const start = Math.floor(min / step) * step
      const ticks = []
      for (let value = start; value <= max + step * 0.5; value += step) {
        ticks.push(Math.round(value * 1e9) / 1e9)
      }
      return ticks
    }

    /**
     * Cartesian chart for line, bar, scatter and histogram payloads.
     * @param {object} props - chart payload, hidden series names and a toggle callback.
     * @returns {object} the svg element.
     */
    function CartesianChart({ data, hidden, onToggle }) {
      const W = 760
      const H = 380
      const L = 58
      const R = 18
      const T = 50
      const B = 44
      const plotW = W - L - R
      const plotH = H - T - B
      const kind = data.kind
      const hiddenSet = new Set(Array.isArray(hidden) ? hidden : [])
      const visible = data.series.filter(series => !hiddenSet.has(series.name))
      const seriesColor = (series) => PALETTE[data.series.indexOf(series) % PALETTE.length]
      if (visible.length === 0) {
        return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `${kind} chart` },
          h('text', { x: W / 2, y: H / 2, textAnchor: 'middle', fontSize: 12, fill: '#6b7280' }, '—'))
      }
      const categoryMode = data.xType === 'category'
      let categories = []
      if (categoryMode) {
        const seen = new Set()
        for (const series of visible) {
          for (const point of series.points) {
            const key = String(point.x)
            if (!seen.has(key)) {
              seen.add(key)
              categories.push(key)
            }
          }
        }
      }
      const xValue = (point) => {
        if (categoryMode) return categories.indexOf(String(point.x))
        if (data.xType === 'time') return Date.parse(String(point.x))
        return Number(point.x)
      }
      const allX = []
      const allY = []
      for (const series of visible) {
        for (const point of series.points) {
          const x = xValue(point)
          if (Number.isFinite(x)) allX.push(x)
          if (typeof point.y === 'number' && Number.isFinite(point.y)) allY.push(point.y)
        }
      }
      if (allX.length === 0 || allY.length === 0) return h('div', { className: 'dc-empty' }, '—')
      let xMin = Math.min(...allX)
      let xMax = Math.max(...allX)
      if (categoryMode) {
        xMin = -0.5
        xMax = Math.max(0.5, categories.length - 0.5)
      } else if (xMin === xMax) {
        xMin -= 1
        xMax += 1
      }
      let yMin = Math.min(...allY)
      let yMax = Math.max(...allY)
      if (kind === 'bar' || kind === 'histogram') yMin = Math.min(0, yMin)
      const pad = (yMax - yMin) * 0.06 || 1
      yMin = kind === 'bar' || kind === 'histogram' ? yMin : yMin - pad
      yMax += pad
      const xScale = (value) => L + ((value - xMin) / (xMax - xMin)) * plotW
      const yScale = (value) => T + plotH - ((value - yMin) / (yMax - yMin)) * plotH
      const yTicks = niceTicks(yMin, yMax, 5).filter(value => value >= yMin && value <= yMax)
      const xTicks = categoryMode
        ? categories.map((label, index) => ({ value: index, label }))
        : niceTicks(xMin, xMax, 6).filter(value => value >= xMin && value <= xMax).map(value => ({
          value,
          label: data.xType === 'time' ? formatTimeLabel(new Date(value).toISOString()) : formatNumber(value),
        }))
      const elements = []
      for (const tick of yTicks) {
        const y = yScale(tick)
        elements.push(h('line', { key: `gy-${tick}`, x1: L, y1: y, x2: W - R, y2: y, stroke: '#e5e7eb', strokeDasharray: '3 3' }))
        elements.push(h('text', { key: `ly-${tick}`, x: L - 8, y: y + 3, textAnchor: 'end', fontSize: 10, fill: '#6b7280' }, formatNumber(tick)))
      }
      for (const tick of xTicks) {
        const x = xScale(tick.value)
        elements.push(h('text', { key: `lx-${tick.value}`, x, y: T + plotH + 16, textAnchor: 'middle', fontSize: 10, fill: '#6b7280' },
          String(tick.label).length > 12 ? `${String(tick.label).slice(0, 11)}…` : String(tick.label)))
      }
      elements.push(h('line', { key: 'axis', x1: L, y1: T + plotH, x2: W - R, y2: T + plotH, stroke: '#9ca3af' }))
      const groups = visible.length
      if (kind === 'line' || kind === 'scatter') {
        visible.forEach((series) => {
          const color = seriesColor(series)
          const points = series.points
            .map(point => ({ x: xScale(xValue(point)), y: yScale(point.y), raw: point }))
            .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
          if (kind === 'line') {
            elements.push(h('polyline', {
              key: `line-${series.name}`,
              fill: 'none',
              stroke: color,
              strokeWidth: 1.8,
              points: points.map(point => `${point.x},${point.y}`).join(' '),
            }))
            if (points.length <= 60) {
              points.forEach((point, pointIndex) => elements.push(h('circle', {
                key: `p-${series.name}-${pointIndex}`, cx: point.x, cy: point.y, r: 2.4, fill: color,
              }, h('title', null, `${series.name} · ${axisLabel(point.raw.x)} → ${formatNumber(point.raw.y)}`))))
            }
          } else {
            points.forEach((point, pointIndex) => elements.push(h('circle', {
              key: `s-${series.name}-${pointIndex}`, cx: point.x, cy: point.y, r: 2.2, fill: color, opacity: 0.7,
            }, h('title', null, `${series.name} · ${axisLabel(point.raw.x)} → ${formatNumber(point.raw.y)}`))))
          }
        })
      } else {
        const isHistogram = kind === 'histogram'
        const categoryCount = categoryMode ? categories.length : Math.max(1, visible[0].points.length)
        const slot = plotW / categoryCount
        const barWidth = isHistogram
          ? Math.max(1, slot * 0.9)
          : Math.max(1, (slot * 0.8) / Math.max(1, groups))
        visible.forEach((series) => {
          const seriesIndex = visible.indexOf(series)
          const color = seriesColor(series)
          series.points.forEach((point, pointIndex) => {
            const rawX = categoryMode ? pointIndex + 0.5 : xValue(point)
            const center = categoryMode ? L + rawX * slot : xScale(rawX)
            const offset = isHistogram || groups === 1
              ? 0
              : (seriesIndex - (groups - 1) / 2) * barWidth
            const y = yScale(Math.max(0, point.y))
            const height = Math.abs(yScale(0) - yScale(Math.max(0, point.y)))
            if (!Number.isFinite(center) || height <= 0) return
            elements.push(h('rect', {
              key: `b-${series.name}-${pointIndex}`,
              x: center - barWidth / 2 + offset,
              y,
              width: barWidth,
              height,
              fill: color,
              rx: 1,
            }, h('title', null, `${series.name} · ${axisLabel(point.x)} → ${formatNumber(point.y)}`)))
          })
        })
      }
      const shownSeries = data.series.slice(0, 8)
      const spacing = Math.min(96, (W - L - R) / Math.max(1, shownSeries.length))
      const legend = shownSeries.map((series, index) => h('g', {
        key: `legend-${series.name}`,
        style: { cursor: typeof onToggle === 'function' ? 'pointer' : 'default', opacity: hiddenSet.has(series.name) ? 0.35 : 1 },
        onClick: typeof onToggle === 'function' ? () => onToggle(series.name) : undefined,
      },
      h('circle', { cx: L + index * spacing, cy: 31, r: 4, fill: seriesColor(series) }),
      h('text', { x: L + index * spacing + 8, y: 35, fontSize: 10, fill: '#4b5563' },
        String(series.name).length > 12 ? `${String(series.name).slice(0, 11)}…` : String(series.name))))
      return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `${kind} chart` },
        h('text', { x: L, y: 16, fontSize: 11, fill: '#374151', fontWeight: 600 },
          `${data.yLabel} · ${data.xLabel}`),
        legend,
        ...elements)
    }

    /**
     * Box-plot chart.
     * @param {object} props - chart payload with `boxes`.
     * @returns {object} the svg element.
     */
    function BoxChart({ data }) {
      const W = 760
      const H = 380
      const L = 58
      const R = 18
      const T = 24
      const B = 48
      const plotW = W - L - R
      const plotH = H - T - B
      const boxes = data.boxes ?? []
      if (boxes.length === 0) return h('div', { className: 'dc-empty' }, '—')
      const mins = boxes.map(box => Number(box.min)).filter(Number.isFinite)
      const maxs = boxes.map(box => Number(box.max)).filter(Number.isFinite)
      let yMin = Math.min(...mins)
      let yMax = Math.max(...maxs)
      const pad = (yMax - yMin) * 0.08 || 1
      yMin -= pad
      yMax += pad
      const yScale = (value) => T + plotH - ((value - yMin) / (yMax - yMin)) * plotH
      const slot = plotW / Math.max(1, boxes.length)
      const half = Math.min(28, slot * 0.28)
      const elements = []
      for (const tick of niceTicks(yMin, yMax, 5).filter(value => value >= yMin && value <= yMax)) {
        const y = yScale(tick)
        elements.push(h('line', { key: `g-${tick}`, x1: L, y1: y, x2: W - R, y2: y, stroke: '#e5e7eb', strokeDasharray: '3 3' }))
        elements.push(h('text', { key: `t-${tick}`, x: L - 8, y: y + 3, textAnchor: 'end', fontSize: 10, fill: '#6b7280' }, formatNumber(tick)))
      }
      boxes.forEach((box, index) => {
        const center = L + slot * (index + 0.5)
        const top = yScale(Number(box.q3))
        const bottom = yScale(Number(box.q1))
        elements.push(h('line', { key: `w-${index}`, x1: center, y1: yScale(Number(box.min)), x2: center, y2: yScale(Number(box.max)), stroke: '#6b7280' }))
        elements.push(h('line', { key: `wc1-${index}`, x1: center - half / 2, y1: yScale(Number(box.min)), x2: center + half / 2, y2: yScale(Number(box.min)), stroke: '#6b7280' }))
        elements.push(h('line', { key: `wc2-${index}`, x1: center - half / 2, y1: yScale(Number(box.max)), x2: center + half / 2, y2: yScale(Number(box.max)), stroke: '#6b7280' }))
        elements.push(h('rect', {
          key: `box-${index}`,
          x: center - half,
          y: Math.min(top, bottom),
          width: half * 2,
          height: Math.max(1, Math.abs(bottom - top)),
          fill: 'rgba(77,107,254,0.14)',
          stroke: PALETTE[0],
        }))
        elements.push(h('line', { key: `med-${index}`, x1: center - half, y1: yScale(Number(box.median)), x2: center + half, y2: yScale(Number(box.median)), stroke: PALETTE[0], strokeWidth: 2 }))
        elements.push(h('text', { key: `lab-${index}`, x: center, y: T + plotH + 18, textAnchor: 'middle', fontSize: 10, fill: '#6b7280' },
          String(box.name).length > 10 ? `${String(box.name).slice(0, 9)}…` : String(box.name)))
      })
      elements.push(h('line', { key: 'axis', x1: L, y1: T + plotH, x2: W - R, y2: T + plotH, stroke: '#9ca3af' }))
      return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'box chart' },
        h('text', { x: L, y: 16, fontSize: 11, fill: '#374151', fontWeight: 600 }, data.yLabel),
        ...elements)
    }

    /**
     * Heatmap chart.
     * @param {object} props - chart payload with rows/cols/values.
     * @returns {object} the svg element.
     */
    function HeatmapChart({ data }) {
      const W = 760
      const H = 380
      const L = 110
      const R = 18
      const T = 36
      const B = 24
      const rows = data.rows ?? []
      const cols = data.cols ?? []
      if (rows.length === 0 || cols.length === 0) return h('div', { className: 'dc-empty' }, '—')
      const values = data.values.flat().filter(value => typeof value === 'number' && Number.isFinite(value))
      const min = values.length > 0 ? Math.min(...values) : 0
      const max = values.length > 0 ? Math.max(...values) : 1
      const span = max - min || 1
      const cellW = (W - L - R) / cols.length
      const cellH = (H - T - B) / rows.length
      const colorOf = (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '#f3f4f6'
        const t = Math.max(0, Math.min(1, (value - min) / span))
        const from = [232, 240, 255]
        const to = [30, 64, 175]
        const rgb = from.map((start, index) => Math.round(start + (to[index] - start) * t))
        return `rgb(${rgb.join(',')})`
      }
      const elements = []
      rows.forEach((row, rowIndex) => {
        elements.push(h('text', {
          key: `r-${rowIndex}`, x: L - 8, y: T + cellH * (rowIndex + 0.5) + 4, textAnchor: 'end', fontSize: 10, fill: '#4b5563',
        }, String(row).length > 12 ? `${String(row).slice(0, 11)}…` : String(row)))
        cols.forEach((col, colIndex) => {
          const value = data.values[rowIndex]?.[colIndex]
          elements.push(h('rect', {
            key: `c-${rowIndex}-${colIndex}`,
            x: L + colIndex * cellW,
            y: T + rowIndex * cellH,
            width: Math.max(1, cellW - 2),
            height: Math.max(1, cellH - 2),
            fill: colorOf(value),
            rx: 2,
          }))
          if (cellW > 44 && cellH > 18 && typeof value === 'number') {
            elements.push(h('text', {
              key: `v-${rowIndex}-${colIndex}`,
              x: L + colIndex * cellW + cellW / 2,
              y: T + rowIndex * cellH + cellH / 2 + 3,
              textAnchor: 'middle',
              fontSize: 9,
              fill: (value - min) / span > 0.55 ? '#ffffff' : '#1f2937',
            }, formatNumber(value)))
          }
        })
      })
      cols.forEach((col, index) => {
        elements.push(h('text', {
          key: `col-${index}`, x: L + cellW * (index + 0.5), y: T - 8, textAnchor: 'middle', fontSize: 10, fill: '#4b5563',
        }, String(col).length > 10 ? `${String(col).slice(0, 9)}…` : String(col)))
      })
      elements.push(h('text', { key: 'metric', x: L, y: 16, fontSize: 11, fill: '#374151', fontWeight: 600 }, data.metric ?? ''))
      elements.push(h('text', { key: 'min', x: W - R, y: H - 6, textAnchor: 'end', fontSize: 9, fill: '#6b7280' }, `${formatNumber(min)} – ${formatNumber(max)}`))
      return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'heatmap' }, ...elements)
    }

    /**
     * Chart dispatcher.
     * @param {object} props - chart payload plus hidden series state.
     * @returns {object} the chart element.
     */
    function Chart({ data, hidden, onToggle }) {
      if (data === null) return h('div', { className: 'dc-empty' }, '—')
      if (data.kind === 'box') return h(BoxChart, { data })
      if (data.kind === 'heatmap') return h(HeatmapChart, { data })
      return h(CartesianChart, { data, hidden, onToggle })
    }

    /**
     * Chart tab: controls plus the rendered chart and export buttons.
     * @param {object} props - profile, chart state, actions and translator.
     * @returns {object} the section.
     */
    function ChartView({ profile, chart, t, onSpec, onGenerate, onCsv, onPng, onToggleSeries }) {
      const columns = profile?.columns ?? []
      const numeric = columns.filter(column => /int|float|decimal|number/i.test(String(column.dtype)))
      const boxRef = useRef(null)
      const spec = chart.spec
      const field = (label, control) => h('label', { className: 'dc-field' }, h('span', { className: 'dc-fieldlabel' }, label), control)
      const kindOptions = [
        ['line', t('chartLine')], ['bar', t('chartBar')], ['scatter', t('chartScatter')],
        ['histogram', t('chartHistogram')], ['box', t('chartBox')], ['heatmap', t('chartHeatmap')],
      ]
      const showAgg = spec.type === 'line' || spec.type === 'bar' || spec.type === 'heatmap'
      const showGroup = spec.type !== 'histogram'
      const yRequired = spec.type !== 'heatmap'
      return h('div', null,
        h('div', { className: 'dc-chartform' },
          field(t('chartType'), h('select', { className: 'dc-select', value: spec.type, onChange: event => onSpec({ type: event.target.value }) },
            kindOptions.map(([value, label]) => h('option', { key: value, value }, label)))),
          field(t('chartX'), h('select', { className: 'dc-select', value: spec.x, onChange: event => onSpec({ x: event.target.value }) },
            columns.map(column => h('option', { key: column.name, value: column.name }, column.name)))),
          field(spec.type === 'heatmap' ? t('chartValue') : t('chartY'), h('select', {
            className: 'dc-select',
            value: spec.y,
            onChange: event => onSpec({ y: event.target.value }),
          },
          h('option', { value: '' }, t('chartNone')),
          (spec.type === 'heatmap' ? columns : numeric).map(column => h('option', { key: column.name, value: column.name }, column.name)))),
          showGroup ? field(spec.type === 'heatmap' ? t('chartCols') : t('chartGroup'), h('select', {
            className: 'dc-select',
            value: spec.group,
            onChange: event => onSpec({ group: event.target.value }),
          },
          h('option', { value: '' }, t('chartNone')),
          columns.map(column => h('option', { key: column.name, value: column.name }, column.name)))) : null,
          showAgg ? field(t('chartAgg'), h('select', {
            className: 'dc-select',
            value: spec.agg,
            onChange: event => onSpec({ agg: event.target.value }),
          },
          ['sum', 'mean', 'count', 'min', 'max'].map(value => h('option', { key: value, value }, value)))) : null,
          spec.type === 'histogram' ? field(t('chartBins'), h('input', {
            className: 'dc-select',
            type: 'number',
            min: 3,
            max: 100,
            value: spec.bins,
            onChange: event => onSpec({ bins: Number(event.target.value) || 20 }),
          })) : null,
          h('div', { className: 'dc-chartactions' },
            h('button', { type: 'button', className: 'dc-btn primary', disabled: chart.loading || !spec.x, onClick: onGenerate },
              chart.loading ? t('busy') : t('generate')),
            h('button', { type: 'button', className: 'dc-btn', disabled: chart.data === null, onClick: onCsv }, t('exportCsv')),
            h('button', { type: 'button', className: 'dc-btn', disabled: chart.data === null, onClick: () => onPng(boxRef.current?.querySelector('svg') ?? null) }, t('exportPng')),
            (chart.hidden ?? []).length > 0 ? h('button', { type: 'button', className: 'dc-btn', onClick: () => onToggleSeries(null) }, t('showAll')) : null)),
        chart.error !== null ? h('div', { className: 'dc-banner' }, chart.error) : null,
        h('div', { className: 'dc-chartbox', ref: boxRef },
          chart.data !== null
            ? h(Chart, { data: chart.data, hidden: chart.hidden, onToggle: onToggleSeries })
            : h('div', { className: 'dc-empty' }, t('chartEmpty'))),
        chart.saved !== null ? h('div', { className: 'dc-note', style: { marginTop: '8px', wordBreak: 'break-all' } }, `${t('savedAt')}: ${chart.saved}`) : null)
    }

    /**
     * Settings view: file limits, chart defaults and the Python interpreter.
     * @param {object} props - settings state, change/save/close callbacks and translator.
     * @returns {object} the settings section.
     */
    function SettingsView({ view, t, onChange, onSave, onClose }) {
      if (view.loading) return h('div', { className: 'dc-empty' }, t('loading'))
      const draft = view.draft
      if (draft === null) return h('div', { className: 'dc-empty' }, view.error ?? t('loading'))
      const row = (label, control, hint) => h('label', { className: 'dc-settingsrow' },
        h('span', { className: 'dc-settingslabel' }, label),
        h('span', { className: 'dc-settingscontrol' }, control, hint ? h('span', { className: 'dc-hint' }, hint) : null))
      const typeOptions = [
        ['line', t('chartLine')], ['bar', t('chartBar')], ['scatter', t('chartScatter')],
        ['histogram', t('chartHistogram')], ['box', t('chartBox')], ['heatmap', t('chartHeatmap')],
      ]
      return h('div', { className: 'dc-settings' },
        h('h3', { className: 'dc-settingstitle' }, t('settings')),
        row(t('maxFileMB'), h('input', {
          className: 'dc-input',
          type: 'number',
          min: 1,
          max: 4096,
          value: draft.maxFileMB,
          placeholder: String(view.defaults?.maxFileMB || ''),
          onChange: event => onChange({ maxFileMB: event.target.value }),
        }), t('maxFileMBHint')),
        row(t('maxRows'), h('input', {
          className: 'dc-input',
          type: 'number',
          min: 1,
          max: 50000000,
          value: draft.maxRows,
          placeholder: '5000000',
          onChange: event => onChange({ maxRows: event.target.value }),
        }), t('maxRowsHint')),
        row(t('defaultChartType'), h('select', {
          className: 'dc-select',
          value: draft.defaultChartType,
          onChange: event => onChange({ defaultChartType: event.target.value }),
        }, typeOptions.map(([value, label]) => h('option', { key: value, value }, label)))),
        row(t('defaultAgg'), h('select', {
          className: 'dc-select',
          value: draft.defaultAgg,
          onChange: event => onChange({ defaultAgg: event.target.value }),
        }, ['sum', 'mean', 'count', 'min', 'max'].map(value => h('option', { key: value, value }, value)))),
        row(t('pythonPath'), h('input', {
          className: 'dc-input',
          type: 'text',
          value: draft.pythonPath,
          placeholder: t('auto'),
          onChange: event => onChange({ pythonPath: event.target.value }),
        }), t('pythonPathHint')),
        view.error !== null ? h('div', { className: 'dc-banner' }, view.error) : null,
        view.saved ? h('div', { className: 'dc-note' }, t('settingsSaved')) : null,
        h('div', { className: 'dc-toolbar' },
          h('button', { type: 'button', className: 'dc-btn primary', disabled: view.saving, onClick: onSave },
            view.saving ? t('busy') : t('save')),
          h('button', { type: 'button', className: 'dc-btn', onClick: onClose }, t('cancel'))))
    }

    /**
     * Directory picker for data files.
     * @param {object} props - browser state, navigation callbacks and translator.
     * @returns {object} the picker block.
     */
    function Browser({ browser, t, onUp, onClose, onEnter, onPick }) {
      return h('div', { className: 'dc-browser' },
        h('div', { className: 'dc-browserhead' },
          h('button', { type: 'button', className: 'dc-btn', disabled: browser.parent === null, title: t('up'), onClick: onUp }, '↑'),
          h('span', { className: 'dc-browserdir', title: browser.dir ?? '' }, browser.dir ?? ''),
          h('button', { type: 'button', className: 'dc-btn', onClick: onClose, 'aria-label': t('close') }, '✕')),
        browser.error !== null ? h('div', { className: 'dc-err', style: { padding: '6px 8px' } }, browser.error) : null,
        h('div', { className: 'dc-browserlist' },
          browser.loading
            ? h('div', { className: 'dc-hint', style: { padding: '6px' } }, t('loading'))
            : browser.entries.length === 0
              ? h('div', { className: 'dc-hint', style: { padding: '6px' } }, t('emptyDir'))
              : browser.entries.map(entry => h('button', {
                key: entry.path,
                type: 'button',
                className: 'dc-browserrow',
                title: entry.path,
                onClick: () => (entry.type === 'dir' ? onEnter(entry.path) : onPick(entry.path)),
              },
              h('span', { className: 'dc-browsericon' }, entry.type === 'dir' ? '📁' : '📄'),
              h('span', { className: 'dc-browsername' }, entry.name),
              entry.type === 'file' ? h('span', { className: 'dc-browsersize' }, formatSize(entry.size)) : null))))
    }

    /**
     * The frame overlay: nothing while closed, otherwise the console.
     * @param {object} props - injected store hook, actions and translator.
     * @returns {object|null} the dialog.
     */
    function Panel(props) {
      const state = props.useStore()
      const { t } = props
      const panelRef = useRef(null)
      const dragRef = useRef(null)
      const resizeRef = useRef(null)
      const inset = titlebarInset()

      useEffect(() => {
        if (!state.open) return undefined
        const panel = panelRef.current
        if (panel !== null) panel.focus()
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            props.close()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [state.open])

      useEffect(() => {
        if (!state.open) return
        void refreshMeta().then(() => {
          const id = store.get().selectedId
          if (id !== null) void loadProfile(id)
        })
      }, [state.open])

      useEffect(() => {
        if (!state.open) return undefined
        let resetSent = false
        const inside = target => panelRef.current !== null && target instanceof Node && panelRef.current.contains(target)        // DSH's document drop handler resets its attachment overlay on drop.
        // Send it an empty drop so the overlay disappears without attaching.
        const settleOverlay = () => {
          try {
            const event = new Event('drop', { bubbles: true, cancelable: true })
            Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [] } })
            document.body.dispatchEvent(event)
          } catch {
            try {
              window.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
            } catch {
              // Older engines without DragEvent: the overlay is cosmetic.
            }
          }
        }
        const onDrag = (event) => {
          if (!inside(event.target)) return
          event.preventDefault()
          event.stopImmediatePropagation()
          if (event.type === 'dragenter' || event.type === 'dragover') {
            if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
            if (!resetSent) {
              resetSent = true
              settleOverlay()
            }
          }
          if (event.type === 'drop') {
            settleOverlay()
            void importFiles(event.dataTransfer?.files ?? null)
          }
        }
        const onDragEnd = (event) => {
          if (event.isTrusted) resetSent = false
        }
        const types = ['dragenter', 'dragover', 'dragleave', 'drop']
        for (const type of types) window.addEventListener(type, onDrag, true)
        window.addEventListener('dragend', onDragEnd, true)
        return () => {
          for (const type of types) window.removeEventListener(type, onDrag, true)
          window.removeEventListener('dragend', onDragEnd, true)
        }
      }, [state.open])

      useEffect(() => {
        if (!state.open || state.layout.mode !== 'sidebar') return undefined
        if (window.innerWidth < 760) return undefined
        const column = document.querySelector('[class*="_centerCol"]')
        if (column === null) return undefined
        const previous = column.style.marginRight
        column.style.marginRight = `${state.layout.width}px`
        return () => {
          column.style.marginRight = previous
        }
      }, [state.open, state.layout.mode, state.layout.width])

      useEffect(() => {
        if (!state.open) return undefined
        const onResize = () => {
          const layout = store.get().layout
          const width = clampSidebarWidth(layout.width)
          if (width !== layout.width) setLayout({ width })
          if (layout.mode !== 'dialog' || layout.x === null || panelRef.current === null) return
          const rect = panelRef.current.getBoundingClientRect()
          const topInset = titlebarInset()
          const x = Math.min(Math.max(8, layout.x), Math.max(8, window.innerWidth - rect.width - 8))
          const y = Math.min(Math.max(topInset + 8, layout.y ?? topInset + 8), Math.max(topInset + 8, window.innerHeight - rect.height - 8))
          if (x !== layout.x || y !== layout.y) setLayout({ x, y })
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [state.open])

      useEffect(() => {
        if (!state.open || state.layout.mode !== 'dialog' || state.layout.x === null) return
        const panel = panelRef.current
        if (panel === null) return
        const rect = panel.getBoundingClientRect()
        const topInset = titlebarInset()
        const x = Math.min(Math.max(8, state.layout.x), Math.max(8, window.innerWidth - rect.width - 8))
        const y = Math.min(Math.max(topInset + 8, state.layout.y ?? topInset + 8), Math.max(topInset + 8, window.innerHeight - rect.height - 8))
        if (x !== state.layout.x || y !== state.layout.y) setLayout({ x, y })
      }, [state.open, state.layout.mode, state.layout.x, state.layout.y])

      if (!state.open) return null

      const selected = state.datasets.find(entry => entry.id === state.selectedId) ?? null
      const baseDir = state.meta?.baseDir ?? ''
      const noPython = state.meta !== null && state.meta.python === null
      const sidebar = state.layout.mode === 'sidebar'

      /**
       * Start dragging the panel by its header.
       * @param {object} event - React pointer event.
       * @returns {void}
       */
      const startDrag = (event) => {
        if (event.button !== 0) return
        if (event.target instanceof Element && event.target.closest('button,input,select,textarea,a') !== null) return
        const panel = panelRef.current
        if (panel === null) return
        event.preventDefault()
        const rect = panel.getBoundingClientRect()
        dragRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          mode: store.get().layout.mode,
          moved: false,
          nextLeft: rect.left,
          nextTop: rect.top,
        }
        panel.classList.add('dc-dragging')
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Pointer capture is an optimisation; window-free dragging still works.
        }
      }

      /**
       * Move the panel, or undock it once dragged left out of the sidebar.
       * @param {object} event - React pointer event.
       * @returns {void}
       */
      const moveDrag = (event) => {
        const drag = dragRef.current
        if (drag === null) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        drag.moved = true
        const panel = panelRef.current
        if (drag.mode === 'sidebar') {
          if (dx > -90) return
          const width = panel !== null ? panel.getBoundingClientRect().width : store.get().layout.width
          const left = Math.min(Math.max(8, event.clientX - width / 2), Math.max(8, window.innerWidth - width - 8))
          const minTop = inset + 8
          const top = Math.min(Math.max(minTop, event.clientY - 24), Math.max(minTop, window.innerHeight - drag.height - 8))
          setLayout({ mode: 'dialog', x: left, y: top })
          drag.mode = 'dialog'
          drag.startX = event.clientX
          drag.startY = event.clientY
          drag.left = left
          drag.top = top
          drag.nextLeft = left
          drag.nextTop = top
          return
        }
        const left = Math.min(Math.max(8, drag.left + dx), Math.max(8, window.innerWidth - drag.width - 8))
        const top = Math.min(Math.max(inset + 8, drag.top + dy), Math.max(inset + 8, window.innerHeight - drag.height - 8))
        drag.nextLeft = left
        drag.nextTop = top
        if (panel !== null) {
          panel.style.left = `${left}px`
          panel.style.top = `${top}px`
          panel.classList.add('dc-floating')
          panel.classList.toggle('dc-near-right', event.clientX > window.innerWidth - 120)
        }
      }

      /**
       * Finish a drag: dock when released near the right edge.
       * @param {object} event - React pointer event.
       * @returns {void}
       */
      const endDrag = (event) => {
        const drag = dragRef.current
        dragRef.current = null
        panelRef.current?.classList.remove('dc-dragging', 'dc-near-right')
        if (drag === null || !drag.moved || drag.mode === 'sidebar') return
        if (event.clientX > window.innerWidth - 120) {
          setLayout({ mode: 'sidebar', x: drag.nextLeft, y: drag.nextTop })
        } else {
          setLayout({ mode: 'dialog', x: drag.nextLeft, y: drag.nextTop })
        }
      }

      /** Toggle between the floating dialog and the docked sidebar. */
      const toggleMode = () => {
        const layout = store.get().layout
        if (layout.mode === 'sidebar') setLayout({ mode: 'dialog' })
        else setLayout({ mode: 'sidebar', width: clampSidebarWidth(layout.width) })
      }

      /**
       * Resize the docked sidebar from its left edge.
       * @param {object} event - React pointer event.
       * @returns {void}
       */
      const startResize = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startWidth = store.get().layout.width
        const panel = panelRef.current
        const column = document.querySelector('[class*="_centerCol"]')
        const move = (moveEvent) => {
          const width = clampSidebarWidth(startWidth + (startX - moveEvent.clientX))
          resizeRef.current = width
          if (panel !== null) panel.style.width = `${width}px`
          if (column !== null && window.innerWidth >= 760) column.style.marginRight = `${width}px`
        }
        const up = () => {
          window.removeEventListener('pointermove', move, true)
          window.removeEventListener('pointerup', up, true)
          if (resizeRef.current !== null) {
            setLayout({ width: resizeRef.current })
            resizeRef.current = null
          }
        }
        window.addEventListener('pointermove', move, true)
        window.addEventListener('pointerup', up, true)
      }

      const panelClass = `dc-panel${sidebar ? ' dc-sidebar' : ''}${!sidebar && state.layout.x !== null ? ' dc-floating' : ''}`
      const panelStyle = sidebar
        ? { width: `${clampSidebarWidth(state.layout.width)}px`, top: inset > 0 ? `${inset}px` : undefined }
        : (state.layout.x !== null ? { left: `${state.layout.x}px`, top: `${state.layout.y}px` } : undefined)

      return h(React.Fragment, null,
        h(Styles),
        h('div', {
          className: `dc-backdrop${sidebar ? ' dc-backdrop-sidebar' : ''}`,
          style: !sidebar && inset > 0 ? { paddingTop: `${24 + inset}px` } : undefined,
          onMouseDown: (event) => {
            if (!sidebar && event.target === event.currentTarget) props.close()
          },
        },
        h('div', {
          className: panelClass,
          role: 'dialog',
          'aria-modal': sidebar ? 'false' : 'true',
          'aria-label': t('title'),
          tabIndex: -1,
          ref: panelRef,
          style: panelStyle,
        },
        sidebar
          ? h('div', {
            className: 'dc-sidebar-resizer',
            onPointerDown: startResize,
            title: t('resizeSidebar'),
          })
          : null,
        h('div', {
          className: 'dc-head',
          onPointerDown: startDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onDoubleClick: (event) => {
            if (event.target instanceof Element && event.target.closest('button') !== null) return
            toggleMode()
          },
        },
          h(GridIcon, { size: 18 }),
          h('h2', { className: 'dc-title' }, t('title')),
          selected !== null ? h('span', { className: 'dc-headmeta' }, `${selected.name} · ${t('meta', { rows: selected.rows.toLocaleString(), cols: selected.cols })}`) : null,
          h('span', { className: 'dc-spacer' }),
          h('button', {
            type: 'button',
            className: 'dc-btn',
            title: sidebar ? t('float') : t('sidebar'),
            'aria-label': sidebar ? t('float') : t('sidebar'),
            onClick: toggleMode,
          }, sidebar ? t('floatShort') : t('sidebarShort')),
          h('button', { type: 'button', className: 'dc-btn', title: t('settings'), 'aria-label': t('settings'), onClick: () => { void openSettings() } }, '⚙'),
          h('button', { type: 'button', className: 'dc-btn', onClick: () => { void refreshMeta() } }, t('refresh')),
          h('button', { type: 'button', className: 'dc-btn', onClick: props.close, 'aria-label': t('close') }, '✕')),
        noPython ? h('div', { className: 'dc-banner', style: { margin: '10px 16px 0' } }, `${t('noPython')} — ${t('error')}`) : null,
        h('div', { className: 'dc-body' },
          sidebar ? null : h('aside', { className: 'dc-side' },
            h('div', { className: 'dc-sidelabel' }, t('dataset')),
            h('div', { className: 'dc-datasets' },
              state.datasets.length === 0
                ? h('div', { className: 'dc-empty' }, t('noDatasets'))
                : state.datasets.map((entry) => {
                  const mine = state.sessionId === null || state.sessionId === ''
                    || (entry.ownerSessionId ?? null) === state.sessionId
                  return h('div', { key: entry.id, style: { display: 'flex', gap: '4px', alignItems: 'center' } },
                    h('button', {
                      type: 'button',
                      className: 'dc-dataset',
                      'data-active': entry.id === state.selectedId ? 'true' : 'false',
                      onClick: () => selectDataset(entry.id),
                      title: entry.path,
                    },
                    h('span', { style: { flex: 1, minWidth: 0 } },
                      h('div', { className: 'dc-dsname' }, entry.name,
                        mine ? null : h('span', { className: 'dc-tag' }, t('otherSession'))),
                      h('div', { className: 'dc-dsmeta' }, t('meta', { rows: entry.rows.toLocaleString(), cols: entry.cols }))),
                    ),
                    h('button', {
                      type: 'button',
                      className: 'dc-btn',
                      style: { height: '24px', padding: '0 6px' },
                      title: t('delete'),
                      onClick: () => { void closeDataset(entry.id) },
                    }, '×'))
                })),
            state.meta !== null && Array.isArray(state.meta.recent) && state.meta.recent.length > 0
              ? h('div', { className: 'dc-recent' },
                h('div', { className: 'dc-recenthead' },
                  h('span', null, t('recent')),
                  h('button', { type: 'button', className: 'dc-linkbtn', onClick: () => { void clearRecent() } }, t('clearRecent'))),
                state.meta.recent.slice(0, 6).map(entry => h('button', {
                  key: `${entry.path}|${entry.requestedSheet ?? ''}`,
                  type: 'button',
                  className: 'dc-recentrow',
                  disabled: entry.exists !== true,
                  title: entry.path,
                  onClick: () => {
                    if (entry.exists === true) void openDataset(entry.path)
                  },
                },
                h('span', { className: 'dc-recentname' }, entry.name ?? entry.path.split(/[\\/]/).pop()),
                h('span', { className: 'dc-recenttime' },
                  entry.exists === true ? formatRecentTime(entry.openedAt) : t('fileMissing')))))
              : null,
            state.folder.entries.length > 0
              ? h('div', { className: 'dc-folder' },
                h('div', { className: 'dc-folderhead' }, `${t('folder')}: ${state.folder.name}`),
                h('div', { className: 'dc-folderlist' },
                  state.folder.entries.map(entry => h('button', {
                    key: `${entry.path}|${entry.name}`,
                    type: 'button',
                    className: 'dc-folderrow',
                    disabled: state.dropBusy,
                    title: `${entry.path} · ${formatSize(entry.size)}`,
                    onClick: () => { void uploadFile(entry.file) },
                  },
                  h('span', { className: 'dc-folderpath' }, entry.path),
                  h('span', { className: 'dc-foldersize' }, formatSize(entry.size))))))
              : null,
            h('div', { className: 'dc-open' },
              h('input', {
                className: 'dc-input',
                value: state.form.path,
                placeholder: t('pathPlaceholder'),
                spellCheck: false,
                onChange: event => store.set(current => ({ ...current, form: { ...current.form, path: event.target.value } })),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void openDataset(store.get().form.path)
                  }
                },
              }),
              h('div', { className: 'dc-openrow' },
                h('button', {
                  type: 'button',
                  className: 'dc-btn primary',
                  disabled: state.form.busy || state.form.path.trim() === '',
                  onClick: () => { void openDataset(store.get().form.path) },
                }, state.form.busy ? t('busy') : t('openFile'))),
              h('div', { className: 'dc-openrow', style: { marginTop: '6px' } },
                h('button', { type: 'button', className: 'dc-btn', onClick: pickFolder }, t('pickFolder')),
                h('button', { type: 'button', className: 'dc-btn', onClick: pickFile }, t('pickFile'))),
              state.dropBusy ? h('div', { className: 'dc-note' }, t('importing')) : null,
              state.form.error !== null ? h('div', { className: 'dc-err' }, state.form.error) : null,
              h('div', { className: 'dc-hint' }, t('dropHint')),
              h('div', { className: 'dc-hint', title: baseDir }, t('openHint', { base: baseDir || 'cwd' })),
              h('div', { className: 'dc-hint' }, t('unsupported')),
              state.folder.error === 'noSupported' ? h('div', { className: 'dc-err' }, t('noSupportedFiles')) : null)),
          h('section', { className: 'dc-main' },
            sidebar
              ? h('div', { className: 'dc-sidebar-tools' },
                h('select', {
                  className: 'dc-select dc-sidebar-select',
                  value: state.selectedId ?? '',
                  'aria-label': t('dataset'),
                  onChange: (event) => {
                    if (event.target.value !== '') selectDataset(event.target.value)
                  },
                },
                h('option', { value: '' }, state.datasets.length === 0 ? t('noDatasets') : t('dataset')),
                state.datasets.map(entry => h('option', { key: entry.id, value: entry.id }, entry.name))),
                h('button', { type: 'button', className: 'dc-btn', title: t('pickFile'), onClick: pickFile }, '＋'),
                h('button', { type: 'button', className: 'dc-btn', title: t('pickFolder'), onClick: pickFolder }, '📁'),
                state.dropBusy ? h('span', { className: 'dc-hint' }, t('importing')) : null)
              : null,
            state.settingsView.open
              ? h(SettingsView, {
                view: state.settingsView,
                t,
                onChange: setSettingsDraft,
                onSave: () => { void saveSettings() },
                onClose: closeSettings,
              })
              : selected === null
                ? h('div', { className: 'dc-empty' }, t('openFirst'))
                : h(React.Fragment, null,
                h('div', { className: 'dc-tabs', role: 'tablist' },
                  ['profile', 'table', 'sql', 'chart'].map(view => h('button', {
                    key: view,
                    type: 'button',
                    role: 'tab',
                    className: 'dc-tab',
                    'data-active': state.view === view ? 'true' : 'false',
                    onClick: () => {
                      store.set(current => ({ ...current, view, status: null }))
                      if (view === 'profile' && state.profile === null) void loadProfile(selected.id)
                      if (view === 'table' && state.table === null) void loadTable(selected.id, 0, null, false)
                      if (view === 'chart' && state.chart.data === null && !state.chart.loading && state.chart.spec.x) void generateChart()
                    },
                  }, t(view)))),
                h('div', { className: 'dc-content' },
                  state.status !== null ? h('div', { className: 'dc-note' },
                    typeof state.status === 'string' ? state.status : t(state.status.key, state.status.params)) : null,
                  state.view === 'profile' ? h(ProfileView, { profile: state.profile, dataset: selected, t }) : null,
                  state.view === 'table'
                    ? h(TableView, {
                      table: state.table,
                      loading: state.tableLoading,
                      page: state.page,
                      sort: state.sort,
                      desc: state.desc,
                      onPrev: () => { void loadTable(selected.id, Math.max(0, state.page - 1), state.sort, state.desc) },
                      onNext: () => { void loadTable(selected.id, state.page + 1, state.sort, state.desc) },
                      onSort: (column) => {
                        const next = state.sort !== column
                          ? { sort: column, desc: false }
                          : state.desc
                            ? { sort: null, desc: false }
                            : { sort: column, desc: true }
                        void loadTable(selected.id, 0, next.sort, next.desc)
                      },
                      filterDraft: state.filterDraft,
                      appliedFilter: state.tableWhere,
                      filtered: state.filtered,
                      onFilter: value => store.set(current => ({ ...current, filterDraft: value })),
                      onApplyFilter: () => { void loadTable(selected.id, 0, state.sort, state.desc, state.filterDraft.trim()) },
                      onClearFilter: () => {
                        store.set(current => ({ ...current, filterDraft: '' }))
                        void loadTable(selected.id, 0, state.sort, state.desc, '')
                      },
                      t,
                    })
                    : null,
                  state.view === 'sql'
                    ? h(QueryView, {
                      query: state.query,
                      tables: [
                        { id: selected.id, name: selected.name, primary: true },
                        ...state.datasets
                          .filter(entry => entry.id !== selected.id)
                          .map(entry => ({ id: entry.id, name: entry.name, primary: false })),
                      ],
                      page: state.queryPage,
                      onPrev: () => store.set(current => ({ ...current, queryPage: Math.max(0, current.queryPage - 1) })),
                      onNext: () => store.set(current => ({ ...current, queryPage: current.queryPage + 1 })),
                      onSql: sql => store.set(current => ({ ...current, query: { ...current.query, sql } })),
                      onRun: () => { void runQuery() },
                      t,
                    })
                    : null,
                  state.view === 'chart'
                    ? h(ChartView, {
                      profile: state.profile,
                      chart: state.chart,
                      t,
                      onSpec: setChartSpec,
                      onGenerate: () => { void generateChart() },
                      onCsv: () => { void saveChartCsv() },
                      onPng: (svg) => { void saveChartPng(svg) },
                      onToggleSeries: toggleSeries,
                    })
                    : null)))))))
    }

    /**
     * Browser plugin body.
     * @param {object} ctx - client context with slots and locale.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'data-console: dictionaries')
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'data-console.trigger',
        order: 42,
        inject: () => ({
          t,
          open: (sessionId) => store.set(state => ({
            ...state,
            open: true,
            status: null,
            sessionId: sessionId ?? null,
            selectedId: null,
            table: null,
            profile: null,
            page: 0,
            sort: null,
            desc: false,
          })),
        }),
      }, Trigger))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'data-console.panel',
        order: 35,
        inject: () => ({
          t,
          useStore: store.use,
          close: () => store.set(state => ({ ...state, open: false })),
        }),
      }, Panel))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
