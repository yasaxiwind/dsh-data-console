/**
 * Generate `market/index.json`, a format-1 DSH plugin market index with one
 * entry for this package. The index can be hosted on any https URL (raw GitHub,
 * jsDelivr, GitHub Pages) and added under Plugins → Discover → Index sources.
 *
 *   node scripts/build-market-index.mjs
 *   node scripts/build-market-index.mjs --check   # fail if the file is stale
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'market', 'index.json')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'))
const icon = readFileSync(join(root, 'icon.svg'))
const iconUrl = `data:image/svg+xml;base64,${icon.toString('base64')}`

if (Buffer.from(iconUrl.split(',')[1], 'base64').length > 32 * 1024) {
  throw new Error('icon exceeds the 32 KiB inline limit of the market index format')
}

function plainRepository(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const url = value.replace(/^git\+/u, '').replace(/\.git$/u, '')
  if (!/^https?:\/\//u.test(url)) return undefined
  return url
}

const repository = plainRepository(pkg.repository?.url)
const epoch = Number(process.env.SOURCE_DATE_EPOCH)
const publishTimestamp = Number.isInteger(epoch) && epoch > 0 ? epoch : Math.floor(Date.now() / 1000)

const index = {
  format: 1,
  title: { en: pkg.name, zh: '数据工作台' },
  description: {
    en: 'A local data console for DeepSeek Harness: CSV/Excel, profiles, SQL, charts and export.',
    zh: 'DeepSeek Harness 的本地数据工作台：CSV/Excel、列画像、SQL、图表与导出。',
  },
  metadata: {
    categories: { data: { title: { en: 'Data', zh: '数据' } } },
    labels: {
      'local-first': { title: { en: 'Local-first', zh: '本地优先' } },
      'agent-tools': { title: { en: 'Agent tools', zh: 'Agent 工具' } },
    },
    sortKeys: {},
  },
  plugins: [{
    name: pkg.name,
    title: { en: en.meta.title, zh: zh.meta.title },
    description: { en: en.meta.description, zh: zh.meta.description },
    icon: iconUrl,
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
    homepage: pkg.homepage,
    repository: repository === undefined ? undefined : { url: repository },
    metadata: {
      category: 'data',
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      labels: ['local-first', 'agent-tools'],
    },
    versions: [{
      version: pkg.version,
      publishTimestamp,
      source: { type: 'npm' },
      engines: typeof pkg.engines?.dsh === 'string' ? { dsh: pkg.engines.dsh } : {},
    }],
  }],
}

const text = `${JSON.stringify(index, null, 2)}\n`

if (process.argv.includes('--check')) {
  if (!existsSync(outFile)) {
    console.error('market/index.json is missing; run npm run market:build')
    process.exit(1)
  }
  const current = readFileSync(outFile, 'utf8')
  if (current !== text) {
    console.error('market/index.json is stale; run npm run market:build and commit the result')
    process.exit(1)
  }
  console.log('market/index.json is up to date')
  process.exit(0)
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, text, 'utf8')
console.log(`wrote market/index.json for ${pkg.name}@${pkg.version}`)
