import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice']

export async function axeViolations(page: Page): Promise<string[]> {
  // The story root, not `main`: component stories render no landmark.
  await page.locator('#storybook-root').waitFor()
  // The theme decorator applies `dark` in an effect. Without this wait axe
  // measures the unthemed DOM and reports contrast the product never ships.
  await page.locator('html.dark').waitFor()
  // That swap changes every token at once, and `transition-all` animates it.
  // Freeze motion so axe samples settled colors instead of intermediate ones.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important }',
  })
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  return violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)
}
