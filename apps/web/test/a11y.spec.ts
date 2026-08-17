import { expect, test } from '@playwright/test'

import { axeViolations } from './axe.ts'
import { STORY_IDS, storyPath } from './stories.ts'

for (const id of STORY_IDS) {
  test(`a11y: ${id}`, async ({ page }) => {
    await page.goto(storyPath(id))
    expect(await axeViolations(page)).toEqual([])
  })
}
