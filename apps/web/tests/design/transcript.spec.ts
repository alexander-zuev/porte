import { expect, test, type Page } from '@playwright/test'

import { storyPath } from './stories.ts'

/**
 * The transcript in a real browser: three thousand messages, a streaming
 * answer, a reader who scrolls up. Scroll events, ResizeObserver, and the
 * virtualizer's own corrections only exist here, so a unit test cannot see them.
 */
const STORY = 'pages-conversation--long-transcript'

const scroller = (page: Page) => page.getByRole('region', { name: 'Conversation' })

/** Pixels between the viewport's bottom edge and the end of the transcript. */
const distanceFromEnd = (page: Page) =>
  scroller(page).evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))

const mountedRows = (page: Page) => page.locator('[data-index]').count()

const scrollToBottom = (page: Page) => page.getByRole('button', { name: 'Scroll to bottom' })

async function open(page: Page) {
  await page.goto(storyPath(STORY))
  await expect(scroller(page)).toBeVisible()
  // Rows measure after mount; the end settles once the last of them has.
  await expect.poll(() => distanceFromEnd(page)).toBe(0)
}

async function wheelUp(page: Page, steps: number) {
  const box = await scroller(page).boundingBox()
  if (box === null) throw new Error('The transcript has no box.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, -120)
  }
}

test('opens at the end with only the rows near the viewport in the DOM', async ({ page }) => {
  await open(page)
  expect(await mountedRows(page)).toBeLessThan(25)
  await expect(scrollToBottom(page)).toBeHidden()
})

test('follows a streaming answer', async ({ page }) => {
  await open(page)
  const start = await scroller(page).evaluate((el) => el.scrollTop)
  await page.getByRole('button', { name: 'Stream', exact: true }).click()
  // A sample can land between a growth and its correction: a few pixels, never a screen.
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(400)
    expect(await distanceFromEnd(page)).toBeLessThan(100)
    await expect(scrollToBottom(page)).toBeHidden()
  }
  await page.getByRole('button', { name: 'Stop stream' }).click()
  await expect.poll(() => distanceFromEnd(page)).toBe(0)
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(start)
})

test('a reader who scrolls up during a stream stays put, and the button brings them back', async ({
  page,
}) => {
  // Alone it passes every time; beside the other suites it is pulled back once in three runs.
  test.fixme(true, 'Following resumes under CPU load without reader input; cause not yet found.')
  await open(page)
  await page.getByRole('button', { name: 'Stream', exact: true }).click()
  await page.waitForTimeout(500)
  await wheelUp(page, 5)
  await expect(scrollToBottom(page)).toBeVisible()
  await expect.poll(() => distanceFromEnd(page)).toBeGreaterThan(200)
  const away = await distanceFromEnd(page)
  // The answer keeps growing below; the reader does not move toward it.
  await expect.poll(() => distanceFromEnd(page), { timeout: 3000 }).toBeGreaterThan(away + 100)

  await scrollToBottom(page).click()
  await expect.poll(() => distanceFromEnd(page)).toBe(0)
  await expect(scrollToBottom(page)).toBeHidden()
})

test('prepending older messages does not move what the reader sees', async ({ page }) => {
  await open(page)
  await wheelUp(page, 10)
  await expect(scrollToBottom(page)).toBeVisible()
  const before = await firstVisibleRow(page)
  await page.getByRole('button', { name: 'Prepend' }).click()
  await page.waitForTimeout(500)
  const after = await firstVisibleRow(page)
  expect(after.key).toBe(before.key)
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1)
})

test('a shorter scroller keeps a following reader at the end', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Shrink' }).click()
  await expect.poll(() => distanceFromEnd(page)).toBe(0)
  await page.getByRole('button', { name: 'Shrink' }).click()
  await expect.poll(() => distanceFromEnd(page)).toBe(0)
})

/** The first row whose bottom edge is inside the viewport: its identity and where it sits. */
function firstVisibleRow(page: Page) {
  return scroller(page).evaluate((el) => {
    const top = el.getBoundingClientRect().top
    for (const row of el.querySelectorAll<HTMLElement>('[data-index]')) {
      const box = row.getBoundingClientRect()
      if (box.bottom > top) {
        return { key: row.textContent?.slice(0, 80) ?? '', top: Math.round(box.top - top) }
      }
    }
    throw new Error('No row is visible.')
  })
}
