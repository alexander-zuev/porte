/* oxlint-disable no-underscore-dangle -- ACP requires the exact `_meta` boundary name. */
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
