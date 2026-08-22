import { expect, test } from '@playwright/test'

import { axeViolations } from './axe.ts'
import { storyPath } from './stories.ts'

test('pairing runs from code entry to a connected Mac', async ({ page }) => {
  await page.goto(storyPath('pages-pair--interactive'))
  await expect(page.getByRole('heading', { name: 'Authorize your Mac' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Pairing code' }).fill('4821AB39')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Connect this Mac?' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await page.getByRole('button', { name: 'Connect this Mac' }).click()
  await expect(page.getByRole('heading', { name: 'Mac connected' })).toBeVisible()

  // The daemon reconnects on its own poll, so the list arrives a beat later.
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
})

test('an expired code offers a fresh attempt', async ({ page }) => {
  await page.goto(storyPath('pages-pair--expired'))
  await expect(page.getByRole('heading', { name: 'Code expired' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await page.getByRole('button', { name: 'Enter a code' }).click()
  await expect(page.getByRole('heading', { name: 'Authorize your Mac' })).toBeVisible()
})

test('cancelling a pairing issue lands on the conversation list', async ({ page }) => {
  await page.goto(storyPath('pages-pair--unavailable'))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
  // The Mac in this harness is paired and has never connected, so the list
  // asks for the daemon rather than reporting an empty list.
  await expect(page.getByRole('heading', { name: 'Start Porte on your Mac' })).toBeVisible()
})

test('refusing a pairing ends the attempt', async ({ page }) => {
  await page.goto(storyPath('pages-pair--confirm'))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Pairing cancelled' })).toBeVisible()
})

test('sign-in continues to the conversation list', async ({ page }) => {
  await page.goto(storyPath('pages-signin--ready'))
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
})

test('a tap hint opens on click and stays reachable', async ({ page }) => {
  await page.goto(storyPath('design-system-components-surfaces--all'))
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Stops the current turn')).toBeVisible()
})

test('an open menu is accessible', async ({ page }) => {
  await page.goto(storyPath('design-system-components-overlays--menu-layer'))
  await expect(page.getByRole('menu')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
