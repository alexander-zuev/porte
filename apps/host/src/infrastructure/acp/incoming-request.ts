import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import type { PendingElicitation } from '@porte/core/client'
import { z } from 'zod'

import { AcpClientRequestError } from './error.ts'
import type { JsonValue } from './message.ts'

const permissionOptionSchema = z.object({
  optionId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['allow_once', 'allow_always', 'reject_once', 'reject_always']),
})

const permissionParamsSchema = z.object({
  sessionId: z.string().min(1),
  toolCall: z.object({
    toolCallId: z.string().min(1),
    title: z.string().nullable().optional(),
  }),
  options: z.array(permissionOptionSchema),
})

const elicitationPropertySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('string'),
    title: z.string().nullish(),
    enum: z.array(z.string()).min(1).optional(),
  }),
  z.object({ type: z.literal('number'), title: z.string().nullish() }),
  z.object({ type: z.literal('integer'), title: z.string().nullish() }),
  z.object({ type: z.literal('boolean'), title: z.string().nullish() }),
])
const elicitationParamsSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('form'),
    sessionId: z.string().min(1),
    requestedSchema: z.object({
      properties: z.record(z.string(), elicitationPropertySchema),
      required: z.array(z.string()).nullish(),
    }),
  }),
  z.object({
    mode: z.literal('url'),
    sessionId: z.string().min(1),
    elicitationId: z.string().min(1),
    url: z.httpUrl(),
  }),
])

/** One validated ACP permission request. */
export type AcpPermissionRequest = z.infer<typeof permissionParamsSchema>

/** One supported ACP elicitation request. */
export type AcpElicitationRequest = {
  readonly sessionId: string
  readonly elicitationId?: string
  readonly request: PendingElicitation['request']
}

const readFileParamsSchema = z.object({
  path: z.string().min(1),
  line: z.number().optional(),
  limit: z.number().optional(),
})

const writeFileParamsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

/** Answer one JSON-RPC request from the ACP agent. */
export async function answerIncomingRequest(
  cwd: string,
  method: string,
  params: JsonValue | undefined,
): Promise<JsonValue> {
  if (method === 'fs/read_text_file') {
    return readTextFile(cwd, params)
  }
  if (method === 'fs/write_text_file') {
    return writeTextFile(cwd, params)
  }
  throw new AcpClientRequestError({ code: -32601, message: `method not found: ${method}` })
}

/** Parse one ACP permission request at the Grok boundary. */
export function parsePermissionRequest(params: JsonValue | undefined): AcpPermissionRequest {
  const parsed = permissionParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new AcpClientRequestError({
      code: -32602,
      message: 'invalid session/request_permission params',
    })
  }
  return parsed.data
}

/** Parse the supported ACP elicitation subset at the Grok boundary. */
export function parseElicitationRequest(params: JsonValue | undefined): AcpElicitationRequest {
  const parsed = elicitationParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new AcpClientRequestError({ code: -32602, message: 'invalid elicitation/create params' })
  }
  if (parsed.data.mode === 'url') {
    return {
      sessionId: parsed.data.sessionId,
      elicitationId: parsed.data.elicitationId,
      request: { type: 'url', url: parsed.data.url },
    }
  }

  const required = new Set(parsed.data.requestedSchema.required ?? [])
  const fields = Object.entries(parsed.data.requestedSchema.properties).map(([id, property]) => {
    const label = property.title ?? id
    if (property.type === 'string') {
      return property.enum === undefined
        ? { type: 'text' as const, id, label, required: required.has(id) }
        : { type: 'text' as const, id, label, required: required.has(id), options: property.enum }
    }
    if (property.type === 'boolean') {
      return { type: 'boolean' as const, id, label, required: required.has(id) }
    }
    return { type: 'number' as const, id, label, required: required.has(id) }
  })
  if (fields.length === 0) {
    throw new AcpClientRequestError({
      code: -32602,
      message: 'elicitation form has no supported fields',
    })
  }
  return { sessionId: parsed.data.sessionId, request: { type: 'form', fields } }
}

async function readTextFile(cwd: string, params: JsonValue | undefined): Promise<JsonValue> {
  const parsed = readFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new AcpClientRequestError({ code: -32602, message: 'invalid fs/read_text_file params' })
  }
  const path = resolveConversationPath(cwd, parsed.data.path)
  try {
    const raw = await readFile(path, 'utf8')
    return { content: sliceLines(raw, parsed.data.line, parsed.data.limit) }
  } catch (cause) {
    throw new AcpClientRequestError({ code: -32000, message: fileErrorMessage(cause) })
  }
}

async function writeTextFile(cwd: string, params: JsonValue | undefined): Promise<JsonValue> {
  const parsed = writeFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new AcpClientRequestError({ code: -32602, message: 'invalid fs/write_text_file params' })
  }
  const path = resolveConversationPath(cwd, parsed.data.path)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, parsed.data.content)
    return {}
  } catch (cause) {
    throw new AcpClientRequestError({ code: -32000, message: fileErrorMessage(cause) })
  }
}

function resolveConversationPath(cwd: string, requestedPath: string): string {
  const root = resolve(cwd)
  const path = resolve(root, requestedPath)
  const fromRoot = relative(root, path)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new AcpClientRequestError({
      code: -32602,
      message: 'path is outside the conversation directory',
    })
  }
  return path
}

function sliceLines(raw: string, line: number | undefined, limit: number | undefined): string {
  if (line === undefined && limit === undefined) {
    return raw
  }
  const lines = raw.split('\n')
  const start = line === undefined ? 0 : Math.max(line - 1, 0)
  const end = limit === undefined ? lines.length : start + limit
  return lines.slice(start, end).join('\n')
}

function fileErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return 'file operation failed'
}
