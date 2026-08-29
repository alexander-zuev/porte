/* oxlint-disable eslint(no-underscore-dangle) -- ACP requires the exact `_meta` boundary name. */
import type { CanonicalContent, ConversationEvent, ToolView } from '@porte/core/client'
import type { ProviderMetadata, UIMessage, UIMessageChunk } from 'ai'

type ProjectedContentChunk = Extract<
  UIMessageChunk,
  | { type: 'file' }
  | { type: 'reasoning-file' }
  | { type: 'source-url' }
  | { type: `data-${string}` }
>

/** Mutable projection state for one assistant stream. */
export type ConversationEventProjectionState = {
  readonly toolInputSignatures: Map<string, string>
  readonly ownMessages: Set<string>
  readonly openText: Set<string>
  readonly openReasoning: Set<string>
}

/**
 * Creates isolated state for one assistant stream.
 *
 * The Host names the user message itself and echoes it on `message.started`
 * with `role: 'user'`; the projector records that id and skips its deltas, so
 * no stored-ids seed is needed. Tool signatures start empty: the machine only
 * updates tools belonging to the turn being projected.
 */
export function createConversationEventProjectionState(): ConversationEventProjectionState {
  return {
    toolInputSignatures: new Map(),
    ownMessages: new Set(),
    openText: new Set(),
    openReasoning: new Set(),
  }
}

/** Maps canonical machine events to AI SDK chunks without transport logic. */
export class ConversationEventProjector {
  project(event: ConversationEvent, state: ConversationEventProjectionState): UIMessageChunk[] {
    switch (event.type) {
      case 'turn.started':
        return [{ type: 'start', messageId: event.turnId }, { type: 'start-step' }]

      case 'turn.finished':
        return event.outcome.type === 'failed'
          ? [{ type: 'error', errorText: event.outcome.error.message }]
          : [{ type: 'finish-step' }, { type: 'finish' }]

      case 'conversation.failed':
        return [{ type: 'error', errorText: event.error.message }]

      case 'message.started':
        if (event.role === 'user') {
          state.ownMessages.add(event.messageId)
          return []
        }
        return []

      case 'message.delta':
        if (state.ownMessages.has(event.messageId)) return []
        if (event.content.type !== 'text') return projectCanonicalContent(event.content, false)
        return [
          ...openPart(state.openText, event.messageId, 'text-start'),
          { type: 'text-delta', id: event.messageId, delta: event.content.text },
        ]

      case 'message.completed':
        return state.openText.delete(event.messageId)
          ? [{ type: 'text-end', id: event.messageId }]
          : []

      case 'reasoning.started':
        state.openReasoning.add(event.messageId)
        return [{ type: 'reasoning-start', id: event.messageId }]

      case 'reasoning.delta':
        if (event.content.type !== 'text') return projectCanonicalContent(event.content, true)
        return [
          ...openPart(state.openReasoning, event.messageId, 'reasoning-start'),
          { type: 'reasoning-delta', id: event.messageId, delta: event.content.text },
        ]

      case 'reasoning.completed':
        return state.openReasoning.delete(event.messageId)
          ? [{ type: 'reasoning-end', id: event.messageId }]
          : []

      case 'tool.updated':
        return projectTool(event.tool, state)

      default:
        return []
    }
  }
}

/** Maps one canonical content part without losing provider content. */
export function projectCanonicalContent(
  content: CanonicalContent,
  reasoning: boolean,
): UIMessageChunk[] {
  if (content.type === 'text') return []
  return projectContentParts(content, reasoning)
}

/** Maps canonical content to complete AI SDK parts for stored user messages. */
export function canonicalContentToUIMessageParts(
  content: CanonicalContent,
  reasoning = false,
): UIMessage['parts'] {
  if (content.type === 'text') return [{ type: 'text', text: content.text, state: 'done' }]
  return projectContentParts(content, reasoning)
}

function projectContentParts(
  content: Exclude<CanonicalContent, { type: 'text' }>,
  reasoning: boolean,
): ProjectedContentChunk[] {
  if (content.type === 'image' || content.type === 'audio') {
    return [
      {
        type: reasoning ? 'reasoning-file' : 'file',
        mediaType: content.mimeType,
        url: `data:${content.mimeType};base64,${content.data}`,
        providerMetadata: contentMetadata(content),
      },
    ]
  }
  if (content.type === 'resource-link' && /^https?:\/\//.test(content.uri)) {
    return [
      {
        type: 'source-url',
        sourceId: content.uri,
        url: content.uri,
        title: content.title ?? content.name,
        providerMetadata: contentMetadata(content),
      },
    ]
  }
  return [
    {
      type: reasoning ? 'data-porte-reasoning-content' : 'data-porte-content',
      data: content,
    },
  ]
}

function openPart(
  openParts: Set<string>,
  id: string,
  type: 'text-start' | 'reasoning-start',
): UIMessageChunk[] {
  if (openParts.has(id)) return []
  openParts.add(id)
  return [{ type, id }]
}

function projectTool(tool: ToolView, state: ConversationEventProjectionState): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = []
  const input = toolInput(tool)
  const signature = JSON.stringify(input)
  if (state.toolInputSignatures.get(tool.toolCallId) !== signature) {
    state.toolInputSignatures.set(tool.toolCallId, signature)
    chunks.push({
      type: 'tool-input-available',
      toolCallId: tool.toolCallId,
      toolName: tool.name ?? tool.kind,
      title: tool.title,
      input,
      toolMetadata: { kind: tool.kind, locations: tool.locations },
      dynamic: true,
    })
  }

  if (tool.status === 'completed') {
    chunks.push({
      type: 'tool-output-available',
      toolCallId: tool.toolCallId,
      output: { content: tool.content, rawOutput: tool.rawOutput ?? null },
      dynamic: true,
    })
  }
  if (tool.status === 'failed') {
    chunks.push({
      type: 'tool-output-error',
      toolCallId: tool.toolCallId,
      errorText: toolFailureText(tool),
      dynamic: true,
    })
  }
  return chunks
}

function toolInput(tool: ToolView) {
  return {
    value: tool.rawInput ?? null,
    title: tool.title,
    kind: tool.kind,
    locations: tool.locations,
    _meta: tool._meta ?? null,
  }
}

function contentMetadata(content: CanonicalContent): ProviderMetadata | undefined {
  if (content.annotations === undefined && content._meta === undefined) return undefined
  const acp: ProviderMetadata[string] = {}
  if (content.annotations !== undefined) acp.annotations = content.annotations
  if (content._meta !== undefined) acp._meta = content._meta
  return { acp }
}

/** Returns provider text for a failed tool, or one stable fallback. */
export function toolFailureText(tool: ToolView): string {
  const text = tool.content
    .map((entry) =>
      entry.type === 'content' && entry.content.type === 'text' ? entry.content.text : '',
    )
    .filter((entry) => entry !== '')
    .join('\n')

  return text === '' ? `${tool.title} failed.` : text
}
