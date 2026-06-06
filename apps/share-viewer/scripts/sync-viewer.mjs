#!/usr/bin/env node
/**
 * Copy the built share-viewer bundle into the Laravel website repo.
 *
 *   npm run build -w @zennotes/share-viewer
 *   npm run sync -w @zennotes/share-viewer -- --out /path/to/laravel/public/vendor/share-viewer
 *
 * The target can also come from ZENNOTES_LARAVEL_PUBLIC (pointing at the
 * Laravel repo's public/ dir or directly at .../vendor/share-viewer).
 * Writes a manifest.json with the package version for cache busting.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')
const dist = path.join(appRoot, 'dist')

function resolveTarget() {
  const argIndex = process.argv.indexOf('--out')
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return path.resolve(process.argv[argIndex + 1])
  }
  const env = process.env.ZENNOTES_LARAVEL_PUBLIC
  if (env) {
    const base = path.resolve(env)
    return base.endsWith(path.join('vendor', 'share-viewer'))
      ? base
      : path.join(base, 'vendor', 'share-viewer')
  }
  return null
}

const target = resolveTarget()
if (!target) {
  console.error(
    'No target. Pass --out <dir> or set ZENNOTES_LARAVEL_PUBLIC to the Laravel public/ directory.'
  )
  process.exit(1)
}

if (!existsSync(path.join(dist, 'share-viewer.js'))) {
  console.error(`No build found at ${dist}. Run: npm run build -w @zennotes/share-viewer`)
  process.exit(1)
}

// Suffix the version with a content hash so the Blade page's ?v=
// query changes on every rebuild, not just on version bumps.
const packageVersion = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version
const contentHash = createHash('sha256')
  .update(readFileSync(path.join(dist, 'share-viewer.js')))
  .update(readFileSync(path.join(dist, 'share-viewer.css')))
  .digest('hex')
  .slice(0, 8)
const version = `${packageVersion}-${contentHash}`

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

for (const entry of ['share-viewer.js', 'share-viewer.css', 'assets']) {
  const source = path.join(dist, entry)
  if (existsSync(source)) {
    cpSync(source, path.join(target, entry), { recursive: true })
  }
}

writeFileSync(
  path.join(target, 'manifest.json'),
  JSON.stringify({ version, syncedAt: new Date().toISOString() }, null, 2)
)

console.log(`share-viewer ${version} → ${target}`)
