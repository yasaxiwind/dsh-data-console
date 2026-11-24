/**
 * Route smoke test against a running DSH web host.
 *
 * It mints the same browser-session cookie the panel uses, then exercises
 * open/dedupe/meta/preview/query/settings/close. Skipped (exit 0) when the
 * host is unreachable or the credentials file is missing.
 *
 * Close other GUI tabs of the same Host first: DSH keeps one browser session
 * per authority, and a live tab can invalidate a minted cookie mid-run.
 *
 *   node test/routes-smoke.mjs
 *   DSH_WEB_URL=http://127.0.0.1:54027 node test/routes-smoke.mjs
 */

import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:54027'
const url = new URL(base)
const authority = url.host

function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  if (process.env.DSH_PROFILE_DIR) return dirname(dirname(process.env.DSH_PROFILE_DIR))
  return join(homedir(), '.dsh')
}

function cookie() {
  const credentials = join(dshHome(), '.credentials.yaml')
  if (!existsSync(credentials)) return null
  const text = readFileSync(credentials, 'utf8')
  const match = text.match(/client-connection\/browser-session:[\s\S]*?secret:\s*(\S+)/)
  if (!match) return null
  const secretText = match[1].trim()
  const secret = Buffer.from(
    secretText.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - secretText.length % 4) % 4),
    'base64',
  )
  const b64url = (buffer) => Buffer.from(buffer).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  const now = Date.now()
  const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 86400_000 }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = b64url(createHmac('sha256', secret).update(body).digest())
  return `dsh-auth-${b64url(createHash('sha256').update(authority).digest())}=v1.${body}.${signature}`
}

async function call(method, path, body, retried = false) {
  const response = await fetch(base + path, {
    method,
    headers: {
      host: authority,
      cookie: cookie(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    // A freshly restarted Host can answer one request with a plain 401 while it re-keys.
    if (response.status === 401 && !retried) {
      await new Promise(resolve => setTimeout(resolve, 800))
      return call(method, path, body, true)
    }
    throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 120)}`)
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(`${method} ${path}: ${JSON.stringify(payload.error ?? payload)}`)
  }
  return payload
}

const assertions = []
function check(name, condition, detail) {
  assertions.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) throw new Error(`assertion failed: ${name}`)
}

const temp = join(tmpdir(), `dc-route-${Date.now()}.csv`)
writeFileSync(temp, 'a,b\n1,x\n2,y\n3,z\n', 'utf8')

let opened = null
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(3000) })
  } catch {
    console.log(`SKIP  host ${base} is not reachable`)
    process.exit(0)
  }
  if (cookie() === null) {
    console.log('SKIP  no browser-session credentials found')
    process.exit(0)
  }

  const first = await call('POST', '/api/data-console/open', { path: temp, sessionId: 'smoke' })
  opened = first.dataset.id
  check('open returns a dataset', Boolean(opened), `${opened} · ${first.dataset.rows} rows`)

  const second = await call('POST', '/api/data-console/open', { path: temp, sessionId: 'smoke' })
  check('re-open reuses the dataset', second.dataset.id === opened, `${second.dataset.id}`)

  const meta = await call('GET', '/api/data-console/meta?sessionId=smoke')
  check('meta lists the dataset', meta.datasets.some(entry => entry.id === opened))
  check('meta exposes effective settings', typeof meta.settings?.maxRows === 'number')

  const preview = await call('GET', `/api/data-console/preview?id=${opened}&limit=2&sessionId=smoke`)
  check('preview pages', preview.rows.length === 2 && preview.total === 3, `${preview.rows.length}/${preview.total}`)

  const filtered = await call('GET', `/api/data-console/preview?id=${opened}&limit=5&where=${encodeURIComponent('a > 1')}&sessionId=smoke`)
  check('preview filters', filtered.total === 2 && filtered.filtered === true, `${filtered.total} rows`)

  const query = await call('POST', '/api/data-console/query', { dataset: opened, sessionId: 'smoke', sql: 'select count(*) c from data' })
  check('query aggregates', query.rows[0][0] === 3, `${query.rows[0][0]} rows`)

  const uploadBody = {
    name: 'smoke-upload.csv',
    data: Buffer.from('a,b\n1,x\n2,y\n', 'utf8').toString('base64'),
    sessionId: 'smoke',
  }
  const uploaded = await call('POST', '/api/data-console/upload', uploadBody)
  check('upload opens a dataset', uploaded.dataset.name === 'smoke-upload.csv' && uploaded.dataset.rows === 2,
    `${uploaded.dataset.name} · ${uploaded.dataset.rows} rows`)
  const uploadedAgain = await call('POST', '/api/data-console/upload', uploadBody)
  check('upload dedupes identical bytes', uploadedAgain.dataset.id === uploaded.dataset.id, uploadedAgain.dataset.id)
  await call('POST', '/api/data-console/close', { dataset: uploaded.dataset.id, sessionId: 'smoke' })
  console.log('PASS  upload close removes the dataset')

  const settings = await call('GET', '/api/data-console/settings')
  check('settings readable', typeof settings.settings.maxFileMB === 'number', `${settings.settings.maxFileMB} MB`)

  await call('POST', '/api/data-console/close', { dataset: opened, sessionId: 'smoke' })
  opened = null
  console.log('PASS  close removes the dataset')
} catch (error) {
  console.error(`\nFAILED: ${error.message}`)
  process.exitCode = 1
} finally {
  if (opened !== null) {
    await call('POST', '/api/data-console/close', { dataset: opened, sessionId: 'smoke' }).catch(() => {})
  }
  try {
    rmSync(temp, { force: true })
  } catch {
    // Temp cleanup is best effort.
  }
}

console.log(`\n${assertions.filter(entry => entry.ok).length}/${assertions.length} assertions passed`)
