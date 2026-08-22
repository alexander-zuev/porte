import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { settle } from './axe.ts'
import { STORY_IDS, storyPath } from './stories.ts'

/**
 * Content wider than the viewport, ignoring anything the page deliberately
 * scrolls in its own box. A table or a code block may scroll; the page may not.
 */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    const offenders = [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
        if (el.closest('.sr-only')) return false
        for (let ancestor = el.parentElement; ancestor && ancestor !== document.body;) {
          const overflowX = getComputedStyle(ancestor).overflowX
          if (overflowX === 'auto' || overflowX === 'scroll') return false
          ancestor = ancestor.parentElement
        }
        return el.getBoundingClientRect().right > doc.clientWidth + 1
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))

    // `scrollbar-gutter: stable` can leave the client box wider than the
    // content, so only a positive difference is real overflow.
    return { pageScroll: Math.max(0, doc.scrollWidth - doc.clientWidth), offenders }
  })

test.describe('reflow at 320px (WCAG 1.4.10)', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const id of STORY_IDS) {
    test(`no horizontal page scroll: ${id}`, async ({ page }, testInfo) => {
      // The viewport is pinned here, so a second project would remeasure the
      // same pixels.
      test.skip(testInfo.project.name !== 'desktop', 'One project covers a pinned viewport.')
      await page.goto(storyPath(id))
      await settle(page)
      expect(await overflow(page)).toEqual({ pageScroll: 0, offenders: [] })
    })
  }
})

/**
 * WCAG 1.4.4: doubling the root size must not clip or scroll the page sideways.
 * Measured at one width. Doubling the text on a 360px phone as well asks for
 * more than either 1.4.4 or 1.4.10 does, and every page fails it.
 */
test.describe('text resized to 200%', () => {
  for (const id of STORY_IDS) {
    test(`no clipping or page scroll: ${id}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'One project covers a text-size change.')
      await page.goto(storyPath(id))
      await settle(page)
      await page.evaluate(async () => {
        document.documentElement.style.fontSize = '32px'
        await document.fonts.ready
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve()
            })
          })
        })
      })
      expect(await overflow(page)).toEqual({ pageScroll: 0, offenders: [] })
    })
  }
})
