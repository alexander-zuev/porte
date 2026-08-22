import { expect, test } from '@playwright/test'

import { settle } from './axe.ts'
import { DESIGN_SYSTEM_STORY_IDS, storyPath } from './stories.ts'

/**
 * One story per route, in its resting state. The other 49 page stories differ
 * from these by a sentence or a spinner, which the a11y and reflow checks
 * already cover on every one of them. A picture each would be 49 more baselines
 * to re-approve for one decision.
 */
const PAGE_IDS = [
  'pages-account--paired',
  'pages-conversation--ready',
  'pages-conversations--ready',
  'pages-host--online',
  'pages-new-conversation--ready',
  'pages-not-found--default',
  'pages-pair--code-entry',
  'pages-route-error--default',
  'pages-signin--ready',
]

/**
 * The checks beside this one all measure a number: a ratio, a width, a ring.
 * None of them can see a layout that is valid and still wrong. This one holds
 * a picture of every board and fails when the picture changes.
 *
 * A failure is not a bug report. It is a diff to look at: accept it with
 * `--update-snapshots` when the change was the point.
 */
test.describe('boards look the way they did', () => {
  for (const id of [...DESIGN_SYSTEM_STORY_IDS, ...PAGE_IDS]) {
    test(id, async ({ page }) => {
      await page.goto(storyPath(id))
      await settle(page)
      // No pixel budget on purpose. `threshold` already absorbs anti-aliasing
      // as a perceived colour difference; a budget on top of it hides real
      // changes, because 1% of a tall board is every corner in the system.
      await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true })
    })
  }
})
