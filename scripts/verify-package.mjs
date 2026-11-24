/**
 * Verify that this folder is a publishable DSH bundle before `npm pack` or
 * `npm publish`. Dependency-free on purpose: it runs in CI and in a fresh
 * checkout without installing anything.
 *
 *   node scripts/verify-package.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const passed = []

function check(name, condition, detail = '') {
  if (condition) passed.push(name)
  else errors.push(detail === '' ? name : `${name} — ${detail}`)
}

function read(relative) {
  return readFileSync(join(root, relative), 'utf8')
}

function exists(relative) {
  return existsSync(join(root, relative))
}

const pkg = JSON.parse(read('package.json'))
const patch = read('cordis.patch.yml')

const NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u

// Manifest
check('package name is a valid npm name', NAME.test(pkg.name), pkg.name)
check('package name is not the local development alias', !pkg.name.startsWith('@local/'), pkg.name)
check('version is exact SemVer', SEMVER.test(pkg.version), pkg.version)
check('package is not private', pkg.private !== true)
check('license is MIT', pkg.license === 'MIT', String(pkg.license))
check('description is present', typeof pkg.description === 'string' && pkg.description.length >= 40)
check('engine range for DSH is declared', typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.length > 0, String(pkg.engines?.dsh))
check('publish access is public', pkg.publishConfig?.access === 'public')

// Files that must exist and ship
const requiredFiles = [
  'index.js',
  'client.js',
  'py/sidecar.py',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'docs/DETAIL.md',
  'docs/DETAIL.zh.md',
  'docs/preview.svg',
  'icon.svg',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'SECURITY.md',
  'RELEASE.md',
  'VERIFICATION.md',
  'market/index.json',
]
for (const file of requiredFiles) check(`${file} exists`, exists(file))

const shipped = pkg.files ?? []
for (const entry of ['index.js', 'client.js', 'py/sidecar.py', 'cordis.patch.yml', 'locale/*.json', 'docs', 'market', 'icon.svg', 'README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'RELEASE.md', 'VERIFICATION.md']) {
  check(`files includes ${entry}`, shipped.includes(entry), shipped.join(', '))
}
check('files ships the sidecar rather than the whole py directory', !shipped.includes('py'), shipped.join(', '))
check('files does not ship the sidecar test module', !shipped.includes('py/test_sidecar.py'), shipped.join(', '))
check('files does not ship tests or workflows', !shipped.some(entry => entry.startsWith('test') || entry.startsWith('.github')), shipped.join(', '))

// Exports
for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
  if (target.includes('*')) continue
  const path = target.replace(/^\.\//u, '')
  check(`export ${subpath} points at ${path}`, exists(path))
}

// Bundle patch
check('dsh.bundle.patch is declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('patch references the package name', patch.includes(pkg.name), pkg.name)
check('patch inserts one data-console row', /id:\s*data-console/u.test(patch))
check('patch does not use the local alias', !patch.includes('@local/'))

// Client manifest
check('client platform is web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform))
check('client injects the expected packages', Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0)

// Locales and detail documents
const locales = readdirSync(join(root, 'locale')).filter(name => name.endsWith('.json'))
check('an English locale exists', locales.includes('en.json'), locales.join(', '))
for (const file of locales) {
  const locale = JSON.parse(read(join('locale', file)))
  check(`${file} has meta.title`, typeof locale.meta?.title === 'string' && locale.meta.title.length > 0)
  check(`${file} has meta.description`, typeof locale.meta?.description === 'string' && locale.meta.description.length >= 40)
  const detail = locale.meta?.detail
  check(`${file} names a detail document`, typeof detail === 'string' && detail.length > 0, String(detail))
  if (typeof detail === 'string' && detail.length > 0) {
    check(`${file} detail document exists`, exists(detail), detail)
    const text = read(detail)
    check(`${file} detail document renders a preview image`, text.includes('preview.svg'))
    check(`${file} detail document is substantive`, text.length >= 600, `${text.length} bytes`)
  }
}

// Icon and artwork
const icon = read('icon.svg')
check('icon.svg is an SVG', icon.trimStart().startsWith('<svg'))
check('icon.svg is under 256 KiB', statSync(join(root, 'icon.svg')).size <= 256 * 1024)
check('preview image is present', exists('docs/preview.svg'))

// README
const readme = read('README.md')
check('README explains the npm install', readme.includes('add dsh-data-console'))
check('README links the license', readme.includes('LICENSE'))
check('README documents requirements', /pandas/u.test(readme))

// Python source
const sidecar = read('py/sidecar.py')
check('sidecar implements reopen for idle recovery', sidecar.includes('op == "reopen"'))
check('sidecar keeps SQL read-only', sidecar.includes('query_only'))

if (errors.length > 0) {
  console.error(`package verification failed (${errors.length}):`)
  for (const error of errors) console.error(`  x ${error}`)
  process.exit(1)
}

console.log(`package verification passed (${passed.length} checks)`)
for (const name of passed) console.log(`  + ${name}`)
