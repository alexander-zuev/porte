import { expect, test } from '@playwright/test'

import { axeViolations } from './axe.ts'
import { storyPath } from './stories.ts'

test('permission surface is accessible when shown', async ({ page }) => {
  await page.goto(storyPath('pages-session--permission'))
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})

test('offline session shows host alert', async ({ page }) => {
  await page.goto(storyPath('pages-session--offline'))
  await expect(page.getByRole('alert')).toContainText('Host is offline')
  expect(await axeViolations(page)).toEqual([])
})

test('tap hint opens on click', async ({ page }) => {
  await page.goto(storyPath('design-system-hoverortap--tap'))
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Stops the current turn')).toBeVisible()
})

test('sign-in error is accessible when shown', async ({ page }) => {
  await page.goto(storyPath('pages-signin--error-state'))
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
