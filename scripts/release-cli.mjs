// The one writer of every CLI version fact. `pnpm release:cli patch|minor|major`
// bumps and rewrites all of them; `sync` rewrites from the current version;
// `check` (CI) fails when any fact disagrees with apps/host/package.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const path = (relative) => resolve(root, relative)

const HOST_PACKAGE = 'apps/host/package.json'
const CORE_VERSION = 'packages/core/src/version.ts'
const PLUGIN = 'plugins/grok/plugin.json'
/** Every document carrying an `@porte/cli@x.y.z` pin. */
const PINNED_DOCS = [
  'README.md',
  'plugins/grok/.mcp.json',
  'plugins/grok/skills/remote-control/SKILL.md',
  'apps/web/public/agent-setup/prompt.md',
]

const PIN = /@porte\/cli@\d+\.\d+\.\d+/g
const CONSTANT = /export const LATEST_CLI_VERSION = '(\d+\.\d+\.\d+)'/

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const mode = process.argv[2] ?? 'patch'
const hostPackage = JSON.parse(readFileSync(path(HOST_PACKAGE), 'utf8'))
const current = hostPackage.version

if (mode === 'check') {
  const failures = []
  const constant = CONSTANT.exec(readFileSync(path(CORE_VERSION), 'utf8'))?.[1]
  if (constant !== current) failures.push(`${CORE_VERSION}: ${constant ?? 'missing'}`)
  const plugin = JSON.parse(readFileSync(path(PLUGIN), 'utf8'))
  if (plugin.version !== current) failures.push(`${PLUGIN}: ${plugin.version}`)
  for (const doc of PINNED_DOCS) {
    const stale = (readFileSync(path(doc), 'utf8').match(PIN) ?? []).filter(
      (pin) => pin !== `@porte/cli@${current}`,
    )
    if (stale.length > 0) failures.push(`${doc}: ${stale.join(', ')}`)
  }
  if (failures.length > 0) {
    console.error(`Version facts disagree with @porte/cli ${current}:`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`All version facts agree: ${current}`)
  process.exit(0)
}

const next = mode === 'sync' ? current : bump(current, mode)

hostPackage.version = next
writeFileSync(path(HOST_PACKAGE), `${JSON.stringify(hostPackage, null, 2)}\n`)

const core = readFileSync(path(CORE_VERSION), 'utf8')
writeFileSync(
  path(CORE_VERSION),
  core.replace(CONSTANT, `export const LATEST_CLI_VERSION = '${next}'`),
)

const plugin = JSON.parse(readFileSync(path(PLUGIN), 'utf8'))
plugin.version = next
writeFileSync(path(PLUGIN), `${JSON.stringify(plugin, null, 2)}\n`)

for (const doc of PINNED_DOCS) {
  const content = readFileSync(path(doc), 'utf8')
  writeFileSync(path(doc), content.replace(PIN, `@porte/cli@${next}`))
}

console.log(`@porte/cli ${current} -> ${next}; every fact rewritten.`)
console.log(`Release with: git commit -am "release(cli): ${next}" && git push`)
console.log(
  'Once the official marketplace lists porte: PR xai-org/plugin-marketplace to advance its commit pin.',
)
