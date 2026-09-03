import { expect, test } from '@playwright/test'

import { settle } from './axe.ts'
import { storyPath } from './stories.ts'

/**
 * One picture per decision. Every other story differs from one of these by a
 * sentence, a spinner, or a closed sheet, which the a11y and reflow checks
 * already cover on every story. A picture each would be another baseline to
 * re-approve, twice, for the same decision.
 */
const BOARD_IDS = [
  'design-system-tokens--reference',
  'design-system-logo--all-sizes',
  'design-system-components-actions--all',
  'design-system-components-forms--all',
  'design-system-components-surfaces--all',
  'design-system-components-surfaces--toasts-long-copy',
  'design-system-components-overlays--dialog-layer',
  'design-system-components-overlays--confirmation-layer',
  'design-system-components-overlays--sheet-layer',
  'design-system-components-overlays--menu-layer',
  'design-system-components-overlays--hint-layer',
  'design-system-components-overlays--command-layer',
  'design-system-ai-chat--empty',
  'design-system-ai-chat--conversation',
  'design-system-ai-chat--turn',
  'design-system-ai-chat--permission',
  'design-system-ai-parts--parts',
  'design-system-ai-composer--interactive',
  'design-system-ai-composer-queue--sending-now',
  'design-system-ai-conversation-changes--sheet-open',
  'design-system-ai-conversation-changes--file-open',
  'design-system-ai-conversation-changes--deep-tree',
  'design-system-ai-conversation-changes--failed',
  'pages-account--paired',
  'pages-conversation--ready',
  'pages-conversations--ready',
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
  for (const id of BOARD_IDS) {
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
