/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
import type {
  ContentBlock,
  LoadSessionResponse,
  NewSessionResponse,
} from '@agentclientprotocol/sdk'
import { EFFORT_OPTION_ID, MODEL_OPTION_ID } from '@host/application/ports/coding-agent.ts'
import type { AcpSessionUpdate } from '@host/infrastructure/acp/message.ts'
import type {
  CanonicalContent,
  ConversationCommand,
  ConversationConfigurationOption,
  ConversationPlan,
  ToolContent,
  ToolLocation,
} from '@porte/core/client'
import { z } from 'zod'

/**
 * ACP `models` on a session response (spec 1, `session/new|load|resume`). The SDK
 * types predate it, so it is parsed off the raw response here.
 */
const sessionModelsSchema = z.object({
  currentModelId: z.string().min(1),
  availableModels: z.array(
    z.object({
      modelId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().nullish(),
      _meta: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
})

export type AcpSessionModels = z.infer<typeof sessionModelsSchema>

/** `models` from a session response, or undefined when the agent sent none. */
export function parseSessionModels(
  response: NewSessionResponse | LoadSessionResponse,
): AcpSessionModels | undefined {
  const parsed = z.object({ models: sessionModelsSchema.optional() }).safeParse(response)
  return parsed.success ? parsed.data.models : undefined
}

/** One selectable effort level from a model's `_meta` (x.ai extension; absent elsewhere). */
const reasoningEffortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullish(),
  default: z.boolean().nullish(),
})

const effortMetaSchema = z.object({
  reasoningEffort: z.string().min(1).optional(),
  reasoningEfforts: z.array(reasoningEffortSchema).min(1).optional(),
})

type ReasoningEffort = z.infer<typeof reasoningEffortSchema>
type SessionModel = AcpSessionModels['availableModels'][number]
type SelectOption = Extract<ConversationConfigurationOption, { type: 'select' }>['options'][number]

/** A plain `set_model` resets the effort, so absent or unknown current means the default. */
function modelEfforts(
  model: SessionModel,
): { current: string; options: readonly ReasoningEffort[] } | undefined {
  const parsed = effortMetaSchema.safeParse(model._meta ?? {})
  if (!parsed.success || parsed.data.reasoningEfforts === undefined) return undefined
  const options = parsed.data.reasoningEfforts
  const fallback = options.find((option) => option.default === true) ?? options[0]
  if (fallback === undefined) return undefined
  const advertised = parsed.data.reasoningEffort
  const current = options.some((option) => option.id === advertised) ? advertised : fallback.id
  return current === undefined ? undefined : { current, options }
}

function selectOption(
  value: string,
  name: string,
  description?: string | null,
  isDefault?: boolean | null,
): SelectOption {
  const option: SelectOption = { type: 'option', value, name }
  if (description !== undefined && description !== null) option.description = description
  if (isDefault === true) option.default = true
  return option
}

/** Official one-liners (x.ai news and docs); the agent's own text covers unlisted models. */
const MODEL_DESCRIPTIONS = new Map<string, string>([
  ['grok-4.6', "The most intelligent and fastest model we've built"],
  ['grok-4.5', 'Built for coding, agentic tasks, and knowledge work'],
])

/** The agent's model list plus the current model's effort levels, when it has any. */
export function modelsToConfigurationOptions(
  models: AcpSessionModels,
): ConversationConfigurationOption[] {
  const model: ConversationConfigurationOption = {
    type: 'select',
    id: MODEL_OPTION_ID,
    name: 'Model',
    category: 'model',
    currentValue: models.currentModelId,
    options: models.availableModels.map((entry) =>
      selectOption(
        entry.modelId,
        entry.name,
        MODEL_DESCRIPTIONS.get(entry.modelId) ?? entry.description,
      ),
    ),
  }
  const current = models.availableModels.find((entry) => entry.modelId === models.currentModelId)
  const efforts = current === undefined ? undefined : modelEfforts(current)
  if (efforts === undefined) return [model]
  return [
    model,
    {
      type: 'select',
      id: EFFORT_OPTION_ID,
      name: 'Effort',
      category: 'effort',
      currentValue: efforts.current,
      options: efforts.options.map((effort) =>
        selectOption(effort.id, effort.label, effort.description, effort.default),
      ),
    },
  ]
}

/**
 * The session's models after one `set_model`: the selection becomes current and
 * its effort becomes the chosen one, or the model's default when none was sent.
 */
export function applyModelSelection(
  models: AcpSessionModels,
  modelId: string,
  reasoningEffort?: string,
): AcpSessionModels {
  return {
    currentModelId: modelId,
    availableModels: models.availableModels.map((model) => {
      if (model.modelId !== modelId) return model
      const efforts = modelEfforts(model)
      if (efforts === undefined) return model
      const fallback =
        efforts.options.find((option) => option.default === true) ?? efforts.options[0]
      const next = reasoningEffort ?? fallback?.id
      if (next === undefined) return model
      return { ...model, _meta: { ...model._meta, reasoningEffort: next } }
    }),
  }
}

/** Canonical prompt content → ACP content block. Inverse of `mapCanonicalContent` for prompts. */
export function toAcpContent(content: CanonicalContent): ContentBlock {
  if (content.type === 'resource-link') {
    const link: Extract<ContentBlock, { type: 'resource_link' }> = {
      type: 'resource_link',
      uri: content.uri,
      name: content.name,
    }
    if (content.title !== undefined) link.title = content.title
    if (content.description !== undefined) link.description = content.description
    if (content.mimeType !== undefined) link.mimeType = content.mimeType
    if (content.size !== undefined) link.size = content.size
    return link
  }
  if (content.type !== 'resource') return content
  const resource = content.resource
  const embedded: Extract<ContentBlock, { type: 'resource' }>['resource'] =
    resource.content.type === 'text'
      ? { uri: resource.uri, text: resource.content.text }
      : { uri: resource.uri, blob: resource.content.data }
  if (resource.mimeType !== undefined) embedded.mimeType = resource.mimeType
  return { type: 'resource', resource: embedded }
}

/**
 * Value conversions from ACP update payloads to the `@porte/core` contract.
 * Pure and stateless; ACP names stay on the input side, canonical names on the output.
 */
export type AcpContentBlock = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'agent_message_chunk' }
>['content']
export type AcpToolContent = NonNullable<
  Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>['content']
>[number]
export type AcpToolLocation = NonNullable<
  Extract<AcpSessionUpdate, { sessionUpdate: 'tool_call' }>['locations']
>[number]
export type AcpCommand = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'available_commands_update' }
>['availableCommands'][number]
export type AcpConfiguration = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'config_option_update' }
>['configOptions'][number]
export type AcpPlan = Extract<AcpSessionUpdate, { sessionUpdate: 'plan_update' }>['plan']
export type AcpMeta = NonNullable<AcpContentBlock['_meta']>
export type AcpRawToolValue = Extract<
  AcpSessionUpdate,
  { sessionUpdate: 'tool_call' | 'tool_call_update' }
>['rawInput']

type SelectConfiguration = Extract<ConversationConfigurationOption, { type: 'select' }>
type SelectConfigurationValue = Extract<SelectConfiguration['options'][number], { type: 'option' }>

export function mapCommand(command: AcpCommand): ConversationCommand {
  const mapped: ConversationCommand = { name: command.name, description: command.description }
  if (command.input !== undefined && command.input !== null) mapped.inputHint = command.input.hint
  return mapped
}

export function mapConfiguration(option: AcpConfiguration): ConversationConfigurationOption {
  if (option.type === 'boolean') {
    const mapped: ConversationConfigurationOption = {
      type: 'boolean',
      id: option.id,
      name: option.name,
      currentValue: option.currentValue,
    }
    if (option.description !== undefined && option.description !== null) {
      mapped.description = option.description
    }
    if (option.category !== undefined && option.category !== null) {
      mapped.category = option.category
    }
    return mapped
  }

  const mapped: ConversationConfigurationOption = {
    type: 'select',
    id: option.id,
    name: option.name,
    currentValue: option.currentValue,
    options: option.options.map((value) => {
      if ('group' in value) {
        return {
          type: 'group' as const,
          group: value.group,
          name: value.name,
          options: value.options.map(mapSelectConfigurationValue),
        }
      }
      return mapSelectConfigurationValue(value)
    }),
  }
  if (option.description !== undefined && option.description !== null) {
    mapped.description = option.description
  }
  if (option.category !== undefined && option.category !== null) mapped.category = option.category
  return mapped
}

function mapSelectConfigurationValue(value: {
  value: string
  name: string
  description?: string | null
}): SelectConfigurationValue {
  const item: SelectConfigurationValue = {
    type: 'option',
    value: value.value,
    name: value.name,
  }
  if (value.description !== undefined && value.description !== null) {
    item.description = value.description
  }
  return item
}

export function mapPlan(plan: AcpPlan): ConversationPlan {
  if (plan.type === 'items') return { type: 'items', planId: plan.planId, entries: plan.entries }
  if (plan.type === 'file') return { type: 'file', planId: plan.planId, uri: plan.uri }
  return { type: 'markdown', planId: plan.planId, content: plan.content }
}

export function mapCanonicalContent(content: AcpContentBlock): CanonicalContent {
  if (content.type === 'resource_link') {
    const mapped: Extract<CanonicalContent, { type: 'resource-link' }> = {
      type: 'resource-link',
      uri: content.uri,
      name: content.name,
    }
    if (content.title !== undefined && content.title !== null) mapped.title = content.title
    if (content.description !== undefined && content.description !== null) {
      mapped.description = content.description
    }
    if (content.mimeType !== undefined && content.mimeType !== null) {
      mapped.mimeType = content.mimeType
    }
    if (content.size !== undefined && content.size !== null) mapped.size = content.size
    copyContentMetadata(mapped, content)
    return mapped
  }
  if (content.type === 'resource') {
    const resource: Extract<CanonicalContent, { type: 'resource' }>['resource'] = {
      uri: content.resource.uri,
      content:
        'text' in content.resource
          ? { type: 'text', text: content.resource.text }
          : { type: 'blob', data: content.resource.blob },
    }
    if (content.resource.mimeType !== undefined && content.resource.mimeType !== null) {
      resource.mimeType = content.resource.mimeType
    }
    if (content.resource._meta !== undefined && content.resource._meta !== null) {
      resource._meta = mapMeta(content.resource._meta)
    }
    const mapped: Extract<CanonicalContent, { type: 'resource' }> = { type: 'resource', resource }
    copyContentMetadata(mapped, content)
    return mapped
  }
  let mapped: Extract<CanonicalContent, { type: 'text' | 'image' | 'audio' }>
  if (content.type === 'text') mapped = { type: 'text', text: content.text }
  else if (content.type === 'audio') {
    mapped = { type: 'audio', data: content.data, mimeType: content.mimeType }
  } else {
    mapped = { type: 'image', data: content.data, mimeType: content.mimeType }
    if (content.uri !== undefined && content.uri !== null) mapped.uri = content.uri
  }
  copyContentMetadata(mapped, content)
  return mapped
}

export function mapToolContent(content: AcpToolContent): ToolContent {
  if (content.type === 'content') {
    const mapped: ToolContent = { type: 'content', content: mapCanonicalContent(content.content) }
    if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
    return mapped
  }
  if (content.type === 'diff') {
    const mapped: ToolContent = {
      type: 'diff',
      path: content.path,
      oldText: content.oldText ?? null,
      newText: content.newText,
    }
    if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
    return mapped
  }
  const mapped: ToolContent = { type: 'terminal', terminalId: content.terminalId }
  if (content._meta !== undefined && content._meta !== null) mapped._meta = mapMeta(content._meta)
  return mapped
}

function copyContentMetadata(
  target: Pick<Extract<CanonicalContent, { type: 'text' }>, 'annotations' | '_meta'>,
  source: {
    annotations?: AcpContentBlock['annotations'] | null
    _meta?: AcpMeta | null
  },
): void {
  if (source.annotations !== undefined && source.annotations !== null) {
    const annotations: NonNullable<typeof target.annotations> = {}
    if (source.annotations.audience !== undefined && source.annotations.audience !== null) {
      annotations.audience = [...source.annotations.audience]
    }
    if (source.annotations.lastModified !== undefined && source.annotations.lastModified !== null) {
      annotations.lastModified = source.annotations.lastModified
    }
    if (source.annotations.priority !== undefined && source.annotations.priority !== null) {
      annotations.priority = source.annotations.priority
    }
    if (source.annotations._meta !== undefined && source.annotations._meta !== null) {
      annotations._meta = mapMeta(source.annotations._meta)
    }
    target.annotations = annotations
  }
  if (source._meta !== undefined && source._meta !== null) target._meta = mapMeta(source._meta)
}

export function mapJson(value: AcpRawToolValue): z.infer<ReturnType<typeof z.json>> | undefined {
  const parsed = z.json().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function mapMeta(value: AcpMeta | null | undefined) {
  if (value === null || value === undefined) return undefined
  const parsed = z.record(z.string(), z.json()).safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function mapLocation(location: AcpToolLocation): ToolLocation {
  const mapped: ToolLocation = { path: location.path }
  if (location.line !== undefined && location.line !== null) mapped.line = location.line
  return mapped
}
