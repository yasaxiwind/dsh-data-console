/**
 * Run the Python sidecar test suite with the same interpreter resolution the
 * plugin uses: DSH_PYTHON, the bundled DSH runtime, then python/python3/py on
 * PATH. The first interpreter that can import pandas and openpyxl wins.
 *
 *   node scripts/run-sidecar-tests.mjs
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')

function bundledInterpreters() {
  const base = join(dshHome, 'dsh-runtimes')
  if (!existsSync(base)) return []
  const names = process.platform === 'win32' ? ['python.exe', 'python'] : ['python', 'python3']
  const found = []
  for (const runtime of readdirSync(base)) {
    for (const name of names) {
      const candidate = join(base, runtime, 'dependencies', 'python', name)
      if (existsSync(candidate)) found.push(candidate)
    }
  }
  return found
}

const candidates = [
  process.env.DSH_PYTHON,
  ...bundledInterpreters(),
  process.platform === 'win32' ? 'python' : 'python3',
  'python',
  'py',
].filter(Boolean)

for (const interpreter of candidates) {
  const probe = spawnSync(interpreter, ['-c', 'import pandas, openpyxl'], { stdio: 'ignore', windowsHide: true })
  if (probe.status !== 0) continue
  const run = spawnSync(interpreter, [join(root, 'py', 'test_sidecar.py')], {
    stdio: 'inherit',
    cwd: root,
    windowsHide: true,
  })
  process.exit(run.status ?? 1)
}

console.error('No Python interpreter with pandas and openpyxl was found.')
console.error('Set DSH_PYTHON to one, or run `pip install pandas openpyxl`.')
process.exit(1)
