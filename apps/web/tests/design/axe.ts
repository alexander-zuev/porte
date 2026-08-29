import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import type { Theme } from './stories.ts'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice']

/**
 * `target-size` carries the wcag22aa tag but ships disabled, so the tag list
 * alone never runs it. It is the rule a thumb-sized product needs most.
 *
 * `region` asks every node to sit in a landmark. Base UI renders overlays in a
 * portal outside one by design, so the rule reports the library rather than the
 * story. Storybook's own a11y addon disables it for the same reason; this keeps
 * the two in step. Mirrored in `.storybook/preview.tsx`.
 */
const RULE_OVERRIDES = {
  'target-size': { enabled: true },
  region: { enabled: false },
  // cmdk gives its list `role="listbox"` and its groups children that are not
  // `option`. The markup is the library's, not ours, and no prop changes it.
  'aria-required-children': { enabled: false },
}

/** Wait until the story is painted in the requested theme and no longer moving. */
export async function settle(page: Page, theme: Theme = 'dark'): Promise<void> {
  await page.locator('#storybook-root').waitFor()
  await page.waitForFunction(() => {
    const channel = Reflect.get(globalThis, '__STORYBOOK_ADDONS_CHANNEL__')
    const storyId = new URLSearchParams(location.search).get('id')
    return channel?.last('storyRendered')?.[0] === storyId
  })
  await page.locator('#storybook-root > *').first().waitFor()
  // The theme decorator applies its class in an effect. Without this wait a
  // check measures the unthemed DOM and reports colors the product never ships.
  await page.locator(`html.${theme}`).waitFor()
  // That swap changes every token at once, and `transition-all` animates it.
  // Freeze motion so a check samples settled colors instead of intermediate ones.
  // Code blocks opt out of off-screen painting; a full-page capture would show
  // every one below the fold as an empty box.
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; content-visibility: visible !important }',
  })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/** Document-level rules a component board cannot satisfy: it is a fragment, not a page. */
export const PAGE_ONLY_RULES = ['page-has-heading-one']

export async function axeViolations(
  page: Page,
  theme: Theme = 'dark',
  disabledRules: readonly string[] = [],
): Promise<string[]> {
  await settle(page, theme)
  const rules = {
    ...RULE_OVERRIDES,
    ...Object.fromEntries(disabledRules.map((rule) => [rule, { enabled: false }])),
  }
  const { violations } = await new AxeBuilder({ page })
    // `options` replaces the whole option object, so it has to come first.
    .options({ rules })
    .withTags(AXE_TAGS)
    .analyze()
  return violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`)
}
