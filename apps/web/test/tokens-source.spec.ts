import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const TOKEN_FILE = join(SRC, 'styles.css')
const SKIP_DIRS = new Set(['components', 'integrations'])
const LITERAL_COLOR = /(oklch\(|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b)/

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      yield* walk(path)
      continue
    }
    if (/\.(tsx|ts|css)$/.test(path)) yield path
  }
}

test('colors are declared only in the token layer', () => {
  const offenders: string[] = []

  for (const path of walk(SRC)) {
    if (path === TOKEN_FILE) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) {
        continue
      }
      if (LITERAL_COLOR.test(line)) {
        offenders.push(`${path.replace(SRC, 'src')}:${index + 1}  ${line.trim()}`)
      }
    }
  }

  expect(offenders).toEqual([])
})
