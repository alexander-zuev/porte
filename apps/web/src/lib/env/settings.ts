import { z } from 'zod'

const TURNSTILE_ALWAYS_PASS_SITE_KEY = '1x00000000000000000000AA'

const siteKey = import.meta.env.STORYBOOK
  ? TURNSTILE_ALWAYS_PASS_SITE_KEY
  : z
      .string()
      .min(1)
      .parse(import.meta.env.VITE_TURNSTILE_SITE_KEY)

export const settings = {
  turnstile: {
    siteKey,
  },
}
