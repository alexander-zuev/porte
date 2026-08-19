/** Storybook iframe ids. Add a row when a new flow story lands. */
export const STORY_IDS = [
  'design-system-tokens--reference',
  'design-system-in-action--workspace',
  'design-system-in-action--settings',
  'design-system-in-action--operations',
  'design-system-hoverortap--tap',
  'pages-landing--hero',
  'pages-signin--ready',
  'pages-signin--pending',
  'pages-signin--error-state',
  'pages-pair--validating',
  'pages-pair--sign-in-required',
  'pages-pair--confirm',
  'pages-pair--confirming',
  'pages-pair--waiting-for-desktop',
  'pages-pair--success',
  'pages-pair--expired',
  'pages-pair--code-entry',
  'pages-pair--invalid-code',
  'pages-home--online-grouped',
  'pages-home--offline',
  'pages-home--empty',
  'pages-session--empty',
  'pages-session--user-only',
  'pages-session--markdown-reply',
  'pages-session--reasoning-open',
  'pages-session--tools',
  'pages-session--streaming-turn',
  'pages-session--permission',
  'pages-session--long-message',
  'pages-session--idle',
  'pages-session--offline',
] as const

export function storyPath(id: string): string {
  return `/iframe.html?id=${id}&viewMode=story`
}
