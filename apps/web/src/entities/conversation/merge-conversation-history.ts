import type { UIMessage } from 'ai'

/** Prepends history and merges duplicate messages by stable AI SDK part identity. */
export function mergeConversationHistory(
  current: readonly UIMessage[],
  history: readonly UIMessage[],
): UIMessage[] {
  const live = new Map(current.map((message) => [message.id, message]))
  const mergedHistory = history.map((stored) => {
    const matching = live.get(stored.id)
    if (matching === undefined || matching.role !== stored.role) return stored
    live.delete(stored.id)
    return mergeMessage(stored, matching)
  })
  return [...mergedHistory, ...current.filter((message) => live.has(message.id))]
}

function mergeMessage(stored: UIMessage, live: UIMessage): UIMessage {
  const remaining = new Map(live.parts.map((part, index) => [partKey(part, index), part] as const))
  const parts = stored.parts.map((part, index) => {
    const key = partKey(part, index)
    const candidate = remaining.get(key)
    if (candidate === undefined) return part
    remaining.delete(key)
    return richerPart(part, candidate)
  })
  parts.push(...live.parts.filter((part, index) => remaining.has(partKey(part, index))))
  return { ...stored, parts }
}

function partKey(part: UIMessage['parts'][number], index: number): string {
  if ('toolCallId' in part) return `tool:${part.toolCallId}`
  if (part.type === 'source-url' || part.type === 'source-document') {
    return `source:${part.sourceId}`
  }
  if (part.type === 'file' || part.type === 'reasoning-file') return `file:${part.url}`
  return `${part.type}:${String(index)}`
}

function richerPart(
  stored: UIMessage['parts'][number],
  live: UIMessage['parts'][number],
): UIMessage['parts'][number] {
  if (
    (stored.type === 'text' || stored.type === 'reasoning') &&
    live.type === stored.type &&
    live.text.length !== stored.text.length
  ) {
    return live.text.length > stored.text.length ? live : stored
  }
  return partProgress(live) > partProgress(stored) ? live : stored
}

function partProgress(part: UIMessage['parts'][number]): number {
  if (!('state' in part)) return JSON.stringify(part).length
  const state = part.state
  const progress =
    state === 'done' || state === 'output-available' || state === 'output-error'
      ? 3
      : state === 'input-available'
        ? 2
        : 1
  return progress * 1_000_000 + JSON.stringify(part).length
}
