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

test('pairing cancel returns to conversations', async ({ page }) => {
  await page.goto(storyPath('pages-pair--confirm'))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
  await expect(page.getByText('No conversations yet')).toBeVisible()
})

test('expired pairing opens fallback code entry', async ({ page }) => {
  await page.goto(storyPath('pages-pair--expired'))
  await page.getByRole('button', { name: 'Enter a code' }).click()
  await expect(page.getByRole('heading', { name: 'Enter code' })).toBeVisible()
})

test('paired success continues to sessions', async ({ page }) => {
  await page.goto(storyPath('pages-pair--success'))
  await page.getByRole('button', { name: 'Open sessions' }).click()
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Daemon list and resume' })).toBeVisible()
})

test('sign-in continues to conversations', async ({ page }) => {
  await page.goto(storyPath('pages-signin--ready'))
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
})
