import { readFileSync } from 'node:fs'

/**
 * The story list comes from the built Storybook, never from a hand-kept array.
 * A hand-kept array goes stale silently: a renamed story keeps passing because
 * the missing id renders an error page that has nothing for axe to report.
 */
const INDEX_PATH = new URL('../../storybook-static/index.json', import.meta.url)

type IndexEntry = {
  readonly id: string
  readonly title: string
  readonly name: string
  readonly type: string
}

type StorybookIndex = { readonly entries: Record<string, IndexEntry> }

function readIndex(): readonly IndexEntry[] {
  let raw: string
  try {
    raw = readFileSync(INDEX_PATH, 'utf8')
  } catch {
    throw new Error(
      'storybook-static/index.json is missing. Run `pnpm run build-storybook` before `test:design`.',
    )
  }
  const entries = Object.values((JSON.parse(raw) as StorybookIndex).entries).filter(
    (entry) => entry.type === 'story',
  )
  if (entries.length === 0) throw new Error('The Storybook index contains no stories.')
  return entries
}

const ENTRIES = readIndex()

/** Every story in the build, sorted so the test list is stable between runs. */
export const STORY_IDS: readonly string[] = ENTRIES.map((entry) => entry.id).sort()

/**
 * The component and token boards. They are the only stories that follow the
 * theme switcher: every page story pins `dark`, which is what the app ships.
 */
export const DESIGN_SYSTEM_STORY_IDS: readonly string[] = STORY_IDS.filter((id) =>
  id.startsWith('design-system-'),
)

export type Theme = 'dark' | 'light'

export function storyPath(id: string, theme: Theme = 'dark'): string {
  return `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`
}
