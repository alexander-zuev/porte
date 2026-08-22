import { expect, test } from '@playwright/test'

import { settle } from './axe.ts'
import { storyPath } from './stories.ts'

type Pair = { readonly fg: string; readonly bg: string; readonly min: number }

/** WCAG 1.4.3 for text, 1.4.11 for a control boundary or a focus ring. */
const TEXT = 4.5
const NON_TEXT = 3

/**
 * Every reachable foreground over every surface it can land on. A token pair
 * that only ever appears inside one component still belongs here: the pair is
 * a promise the token layer makes, and a component is free to take it up.
 */
const PAIRS: readonly Pair[] = [
  { fg: '--foreground', bg: '--background', min: TEXT },
  { fg: '--foreground', bg: '--surface', min: TEXT },
  { fg: '--foreground', bg: '--popover', min: TEXT },
  { fg: '--foreground', bg: '--surface-hover', min: TEXT },
  { fg: '--foreground', bg: '--surface-active', min: TEXT },
  { fg: '--foreground', bg: '--muted', min: TEXT },
  { fg: '--card-foreground', bg: '--card', min: TEXT },
  { fg: '--popover-foreground', bg: '--popover', min: TEXT },
  { fg: '--muted-foreground', bg: '--background', min: TEXT },
  { fg: '--muted-foreground', bg: '--surface', min: TEXT },
  { fg: '--muted-foreground', bg: '--popover', min: TEXT },
  { fg: '--muted-foreground', bg: '--surface-hover', min: TEXT },
  { fg: '--muted-foreground', bg: '--muted', min: TEXT },
  { fg: '--primary-foreground', bg: '--primary', min: TEXT },
  { fg: '--secondary-foreground', bg: '--secondary', min: TEXT },
  { fg: '--accent-foreground', bg: '--accent', min: TEXT },
  // The tooltip inverts the page: dark text on a light slab.
  { fg: '--background', bg: '--foreground', min: TEXT },
  { fg: '--destructive-foreground', bg: '--destructive', min: TEXT },
  { fg: '--destructive-muted-foreground', bg: '--background', min: TEXT },
  { fg: '--destructive-muted-foreground', bg: '--surface', min: TEXT },
  { fg: '--destructive-muted-foreground', bg: '--destructive-muted', min: TEXT },
  { fg: '--status-info-muted-foreground', bg: '--background', min: TEXT },
  { fg: '--status-info-muted-foreground', bg: '--surface', min: TEXT },
  { fg: '--status-info-muted-foreground', bg: '--status-info-muted', min: TEXT },
  { fg: '--status-warning-muted-foreground', bg: '--background', min: TEXT },
  { fg: '--status-warning-muted-foreground', bg: '--surface', min: TEXT },
  { fg: '--status-warning-muted-foreground', bg: '--status-warning-muted', min: TEXT },
  { fg: '--status-success-muted-foreground', bg: '--background', min: TEXT },
  { fg: '--status-success-muted-foreground', bg: '--surface', min: TEXT },
  { fg: '--status-success-muted-foreground', bg: '--status-success-muted', min: TEXT },
  { fg: '--ring', bg: '--background', min: NON_TEXT },
  { fg: '--ring', bg: '--surface', min: NON_TEXT },
  { fg: '--ring', bg: '--popover', min: NON_TEXT },
  { fg: '--ring', bg: '--muted', min: NON_TEXT },
  { fg: '--ring', bg: '--surface-hover', min: NON_TEXT },
  // Status dots and solid fills carry meaning, so they need the 3:1 floor.
  { fg: '--status-success', bg: '--background', min: NON_TEXT },
  { fg: '--status-warning', bg: '--background', min: NON_TEXT },
  { fg: '--status-info', bg: '--background', min: NON_TEXT },
  { fg: '--destructive', bg: '--background', min: NON_TEXT },
  { fg: '--status-success', bg: '--surface', min: NON_TEXT },
  { fg: '--destructive', bg: '--surface', min: NON_TEXT },
]

test('token contrast pairs meet WCAG minimums in the shipped theme', async ({ page }) => {
  await page.goto(storyPath('design-system-tokens--reference', 'dark'))
  await settle(page, 'dark')

  const failures = await page.evaluate((pairs) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas 2d context missing')
    const root = getComputedStyle(document.documentElement)

    // Painting resolves any alpha token against the surface below it, which is
    // the only way a halo like `--ring` can be measured honestly.
    const paint = (color: string, backdrop?: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
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
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    }

    const token = (name: string) => {
      const value = root.getPropertyValue(name).trim()
      if (!value) throw new Error(`Token ${name} is not defined`)
      return value
    }

    const pageBackground = token('--background')

    return pairs
      .map(({ fg, bg, min }) => {
        // A background token can be an alpha too, so it settles on the canvas first.
        const bgPixel = paint(token(bg), pageBackground)
        const bgColor = `rgb(${bgPixel[0]} ${bgPixel[1]} ${bgPixel[2]})`
        const bgLuminance = luminance(bgPixel)
        const fgLuminance = luminance(paint(token(fg), bgColor))
        const [lighter, darker] =
          fgLuminance > bgLuminance ? [fgLuminance, bgLuminance] : [bgLuminance, fgLuminance]
        const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
        return { pair: `${fg} on ${bg}`, ratio, min }
      })
      .filter((row) => row.ratio < row.min)
  }, PAIRS)

  expect(failures).toEqual([])
})
