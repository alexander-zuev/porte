import { expect, test } from '@playwright/test'

import { STORY_IDS, storyPath } from './stories.ts'

const overflow = (page: import('@playwright/test').Page) =>
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

    return { pageScroll: doc.scrollWidth - doc.clientWidth, offenders }
  })

test.describe('reflow at 320px (WCAG 1.4.10)', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const id of STORY_IDS) {
    test(`no horizontal page scroll: ${id}`, async ({ page }) => {
      await page.goto(storyPath(id))
      expect(await overflow(page)).toEqual({ pageScroll: 0, offenders: [] })
    })
  }
})

test.describe('text resized to 200%', () => {
  for (const id of STORY_IDS) {
    test(`no clipping or page scroll: ${id}`, async ({ page }) => {
      await page.goto(storyPath(id))
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
