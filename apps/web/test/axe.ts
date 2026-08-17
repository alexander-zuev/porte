import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice']

export async function axeViolations(page: Page): Promise<string[]> {
  await page.locator('main').waitFor()
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  return violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)
}
