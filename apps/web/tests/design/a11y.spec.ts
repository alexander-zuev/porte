import { expect, test } from '@playwright/test'

import { PAGE_ONLY_RULES, axeViolations } from './axe.ts'
import { DESIGN_SYSTEM_STORY_IDS, STORY_IDS, storyPath } from './stories.ts'

/**
 * Dark only: the root route pins `class="dark"`, so light is not a surface a
 * person can reach. Testing it would guard pixels the product never paints.
 * Page rules stay on for page stories; a component board is not a page.
 */
for (const id of STORY_IDS) {
  const disabled = DESIGN_SYSTEM_STORY_IDS.includes(id) ? PAGE_ONLY_RULES : []
  test(`a11y: ${id}`, async ({ page }) => {
    await page.goto(storyPath(id, 'dark'))
    expect(await axeViolations(page, 'dark', disabled)).toEqual([])
  })
}
