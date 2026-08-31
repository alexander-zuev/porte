import type { FileRouteTypes } from '@web/lib/router/routeTree.gen.ts'

export const CANONICAL_ORIGIN = 'https://useporte.dev'
export const SITE_NAME = 'Porte'

/** 1200x630 share card. Absolute, because crawlers do not resolve relative image URLs. */
const OG_IMAGE = `${CANONICAL_ORIGIN}/og.png`
const OG_IMAGE_ALT =
  'Porte wordmark. Grok stays on your machine. You do not have to. The command grok plugin install porte.'

/** The page background (`--gray-1` dark), for the bars around a home-screen app. */
// oxlint-disable-next-line design-system/no-raw-colors -- a meta tag cannot read a CSS token.
export const THEME_COLOR = '#111111'

/** Head entries every page shares; routes add their own on top. */
export const ROOT_META = [
  { charSet: 'utf-8' },
  // `viewport-fit=cover` is what makes the safe-area insets non-zero.
  { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  { title: SITE_NAME },
  // Added to the home screen, Porte opens without browser chrome; the bars take the page colour.
  { name: 'theme-color', content: THEME_COLOR },
  { name: 'mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: SITE_NAME },
] as const

/** All three icons are the same drawing (`Design System/Logo › Icon`), exported per size. */
export const ROOT_LINKS = [
  { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
] as const

/** SERP truncates meta descriptions near 160 chars; cap at 155 to keep a safety margin. */
export const META_DESCRIPTION_MAX = 155
/** SERP truncates titles near 60 chars. */
export const TITLE_MAX = 60

const BRAND_SUFFIX = ` | ${SITE_NAME}`

/** Inputs for a public page's document head. */
export type SeoHeadInput = {
  readonly title: string
  readonly description: string
  /** A real route, so a canonical cannot point at a page that does not exist. */
  readonly path: FileRouteTypes['fullPaths']
  /** Keep the page out of search results. Use for utility pages. */
  readonly noIndex?: boolean
}

/**
 * Cap a description at {@link META_DESCRIPTION_MAX} on a word boundary, never mid-word,
 * and trim trailing punctuation. Short descriptions pass through unchanged.
 */
export function capMetaDescription(text: string): string {
  if (text.length <= META_DESCRIPTION_MAX) return text
  const slice = text.slice(0, META_DESCRIPTION_MAX)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:.–—-]+$/, '')
}

/**
 * Shorten an over-long title losslessly: drop the redundant brand suffix once the title
 * passes {@link TITLE_MAX}. Titles still long after that stay as they are, because Google
 * rewrites over-long titles and that reads better than cutting one mid-phrase.
 */
export function fitTitle(title: string): string {
  if (title.length <= TITLE_MAX) return title
  return title.endsWith(BRAND_SUFFIX) ? title.slice(0, -BRAND_SUFFIX.length) : title
}

/**
 * Build the head for a public page: title, description, Open Graph, and canonical.
 *
 * This is the single chokepoint, so every public page stays inside the SERP limits
 * without each route policing its own copy. The canonical collapses query-string
 * variants, so `?returnTo=` links do not crawl as separate pages.
 */
export function createSeoHead({ title, description, path, noIndex = false }: SeoHeadInput) {
  const canonical = `${CANONICAL_ORIGIN}${path}`
  const pageTitle = fitTitle(title)
  const pageDescription = capMetaDescription(description)

  const meta = [
    { title: pageTitle },
    { name: 'description', content: pageDescription },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: pageDescription },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:image', content: OG_IMAGE },
    { property: 'og:image:alt', content: OG_IMAGE_ALT },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: pageTitle },
    { name: 'twitter:description', content: pageDescription },
    { name: 'twitter:image', content: OG_IMAGE },
    { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
  ]

  if (noIndex) {
    meta.push({ name: 'robots', content: 'noindex, nofollow' })
  }

  return { meta, links: [{ rel: 'canonical', href: canonical }] }
}
