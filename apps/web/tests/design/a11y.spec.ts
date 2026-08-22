import { expect, test } from '@playwright/test'

import { axeViolations } from './axe.ts'
import { STORY_IDS, storyPath } from './stories.ts'

/**
 * Dark only: the root route pins `class="dark"`, so light is not a surface a
 * person can reach. Testing it would guard pixels the product never paints.
 */
for (const id of STORY_IDS) {
  test(`a11y: ${id}`, async ({ page }) => {
    await page.goto(storyPath(id, 'dark'))
    expect(await axeViolations(page, 'dark')).toEqual([])
  })
}
