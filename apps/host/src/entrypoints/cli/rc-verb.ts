import type { Switch } from '@host/application/commands/remote-control.ts'

/**
 * One remote-control verb, from `porte rc` argv or a `/remote-control` prompt.
 *
 * The first four are what a person types. The rest are run by the plugin,
 * the hook, or the pairing watcher.
 */
export type RcVerb =
  | { readonly kind: 'remote'; readonly to: Switch }
  | { readonly kind: 'status' }
  | { readonly kind: 'status-line'; readonly to: Switch }
  | { readonly kind: 'unpair' }
  | { readonly kind: 'hook' }
  | { readonly kind: 'enable-hook' }
  | { readonly kind: 'disable-hook' }
  | { readonly kind: 'watch-pairing' }

const PLUGIN_VERBS = ['hook', 'enable-hook', 'disable-hook', 'watch-pairing'] as const

/** The words after `rc` or `/remote-control` as one verb, or null when they name none. */
export function parseRcWords(words: readonly string[]): RcVerb | null {
  const [first, second, ...rest] = words
  if (rest.length > 0) return null
  if (first === undefined) return { kind: 'remote', to: 'toggle' }
  if (first === 'on' || first === 'off')
    return second === undefined ? { kind: 'remote', to: first } : null
  if (first === 'toggle') return second === undefined ? { kind: 'remote', to: 'toggle' } : null
  if (first === 'status-line') {
    const to = second === undefined ? 'toggle' : second
    return to === 'on' || to === 'off' || to === 'toggle' ? { kind: 'status-line', to } : null
  }
  if (second !== undefined) return null
  if (first === 'status' || first === 'unpair') return { kind: first }
  const plugin = PLUGIN_VERBS.find((verb) => verb === first)
  return plugin === undefined ? null : { kind: plugin }
}

/** A prompt as its verb; `unknown` for the command with words it does not know; null for other prompts. */
export function parsePromptVerb(prompt: string): PromptVerb | 'unknown' | null {
  if (!prompt.startsWith('/remote-control')) return null
  const words = prompt.slice('/remote-control'.length).trim().split(/\s+/).filter(Boolean)
  const verb = parseRcWords(words)
  // The plugin-only verbs are not for prompts: a typed `hook` would hang on stdin.
  if (verb === null || !isPromptVerb(verb)) return 'unknown'
  return verb
}

/** The verbs a person may type after `/remote-control`. */
export type PromptVerb = Extract<RcVerb, { kind: 'remote' | 'status' | 'status-line' | 'unpair' }>

export function isPromptVerb(verb: RcVerb): verb is PromptVerb {
  return (
    verb.kind === 'remote' ||
    verb.kind === 'status' ||
    verb.kind === 'status-line' ||
    verb.kind === 'unpair'
  )
}
