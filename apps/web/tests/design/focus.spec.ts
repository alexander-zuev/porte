import { expect, test } from '@playwright/test'

import { settle } from './axe.ts'
import { DESIGN_SYSTEM_STORY_IDS, storyPath } from './stories.ts'

/** The component boards hold one of every control, so tabbing them covers the set. */
const BOARDS = DESIGN_SYSTEM_STORY_IDS.filter((id) => id.startsWith('design-system-components-'))

const MAX_STOPS = 80

/**
 * WCAG 2.4.7: a keyboard user must see where focus is. Every control in the
 * system draws that with a ring, which lands in `box-shadow`, so a focused
 * control with neither an outline nor a shadow has no indicator at all.
 */
test.describe('focus is visible', () => {
  for (const id of BOARDS) {
    test(id, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'The indicator is paint, not layout.')
      await page.goto(storyPath(id))
      await settle(page)
      await page.locator('body').click({ position: { x: 2, y: 2 } })

      const offenders: string[] = []
      for (let stop = 0; stop < MAX_STOPS; stop += 1) {
        await page.keyboard.press('Tab')
        const step = await page.evaluate(() => {
          /**
           * A ring is drawn with `--tw-ring-shadow`, which stays at its initial
           * value until a ring utility applies. Reading the composed
           * `box-shadow` cannot tell a painted ring from a transparent one.
           */
          const indicates = (node: Element) => {
            const style = getComputedStyle(node)
            if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) {
              return true
            }
            const ring = style.getPropertyValue('--tw-ring-shadow').trim()
            return ring !== '' && ring !== '0 0 #0000'
          }

          const el = document.activeElement
          if (!(el instanceof HTMLElement) || el === document.body) return null
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return { name: '', indicated: true }
          }
          // Only keyboard focus draws a ring, which is the state under test.
          if (!el.matches(':focus-visible')) return { name: '', indicated: true }

          // `input-otp` focuses one hidden input and paints the caret on the
          // slot standing for the current character, which is neither the input
          // nor an ancestor of it.
          if (
            el.matches('[data-slot=input-otp]') &&
            el.closest('.cn-input-otp')?.querySelector('[data-active=true]')
          ) {
            return { name: '', indicated: true }
          }

          // An input group puts the ring on the wrapper that owns the border.
          let indicated = false
          let node: Element | null = el
          for (let depth = 0; node && depth < 3; depth += 1) {
            if (indicates(node)) {
              indicated = true
              break
            }
            node = node.parentElement
          }

          const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''
          return {
            name: `${el.tagName.toLowerCase()} "${label}" [${el.className.slice(0, 120)}]`,
            indicated,
          }
        })
        if (step === null) break
        if (!step.indicated) offenders.push(step.name)
      }

      expect([...new Set(offenders)]).toEqual([])
    })
  }
})
