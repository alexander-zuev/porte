import { expect, test } from '@playwright/test'

import { storyPath } from './stories.ts'

type Pair = { fg: string; bg: string; min: number; where: string }

const NON_TEXT = 3
const TEXT = 4.5

const PAIRS: Pair[] = [
  { fg: '--ring', bg: '--background', min: NON_TEXT, where: 'focus ring on page' },
  { fg: '--ring', bg: '--card', min: NON_TEXT, where: 'focus ring on card' },
  { fg: '--ring', bg: '--muted', min: NON_TEXT, where: 'focus ring on muted' },
  { fg: '--foreground', bg: '--background', min: TEXT, where: 'body copy' },
  { fg: '--foreground', bg: '--card', min: TEXT, where: 'card text' },
  { fg: '--foreground', bg: '--muted', min: TEXT, where: 'text on muted' },
  { fg: '--muted-foreground', bg: '--background', min: TEXT, where: 'secondary text' },
  { fg: '--muted-foreground', bg: '--muted', min: TEXT, where: 'secondary on muted' },
  { fg: '--muted-foreground', bg: '--card', min: TEXT, where: 'secondary on card' },
  { fg: '--primary-foreground', bg: '--primary', min: TEXT, where: 'primary button label' },
  { fg: '--card-foreground', bg: '--card', min: TEXT, where: 'card title' },
]

test('token contrast pairs meet WCAG minimums', async ({ page }) => {
  await page.goto(storyPath('design-system-tokens--dark'))
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
  })

  const failures = await page.evaluate((pairs) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas 2d context missing')
    const root = getComputedStyle(document.documentElement)

    const paint = (color: string, backdrop?: string): [number, number, number] => {
      if (backdrop) {
        ctx.fillStyle = backdrop
        ctx.fillRect(0, 0, 1, 1)
      }
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      const pixel = ctx.getImageData(0, 0, 1, 1).data
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
    }

    const luminance = ([r, g, b]: [number, number, number]) => {
      const toLinear = (value: number) => {
        const s = value / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    }

    const token = (name: string) => {
      const value = root.getPropertyValue(name).trim()
      if (!value) throw new Error(`Token ${name} is not defined`)
      return value
    }

    return pairs
      .map(({ fg, bg, min, where }) => {
        const bgValue = token(bg)
        const bgLuminance = luminance(paint(bgValue))
        const fgLuminance = luminance(paint(token(fg), bgValue))
        const [lighter, darker] =
          fgLuminance > bgLuminance ? [fgLuminance, bgLuminance] : [bgLuminance, fgLuminance]
        const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
        return { where, fg, bg, ratio, min }
      })
      .filter((row) => row.ratio < row.min)
  }, PAIRS)

  expect(failures).toEqual([])
})
