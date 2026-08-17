import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import type { JsonRpcError, JsonValue } from './message.ts'

const permissionOptionSchema = z.object({
  optionId: z.string().min(1),
  kind: z.string().optional(),
})

const permissionParamsSchema = z.object({
  options: z.array(permissionOptionSchema),
})

const readFileParamsSchema = z.object({
  path: z.string().min(1),
  line: z.number().optional(),
  limit: z.number().optional(),
})

const writeFileParamsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

/**
 * Answer one JSON-RPC request Grok sent to this client.
 *
 * @param method - ACP method name.
 * @param params - Request params, if any.
 */
export async function answerIncomingRequest(
  method: string,
  params: JsonValue | undefined,
): Promise<ResultType<JsonValue, JsonRpcError>> {
  if (method === 'session/request_permission') {
    return answerPermission(params)
  }
  if (method === 'fs/read_text_file') {
    return readTextFile(params)
  }
  if (method === 'fs/write_text_file') {
    return writeTextFile(params)
  }
  return Result.err({ code: -32601, message: `method not found: ${method}` })
}

/**
 * Pick the once-allow option from a permission request.
 *
 * @param params - `session/request_permission` params.
 */
export function selectAllowOnce(params: JsonValue | undefined): string | undefined {
  const parsed = permissionParamsSchema.safeParse(params)
  if (!parsed.success) {
    return undefined
  }
  const allowed = parsed.data.options.find((option) => {
    const kind = option.kind?.replaceAll('-', '_')
    return kind === 'allow_once' || option.optionId.includes('allow')
  })
  return allowed?.optionId ?? parsed.data.options[0]?.optionId
}

function answerPermission(params: JsonValue | undefined): ResultType<JsonValue, JsonRpcError> {
  const optionId = selectAllowOnce(params)
  if (optionId === undefined) {
    return Result.ok({ outcome: { outcome: 'cancelled' } })
  }
  return Result.ok({ outcome: { outcome: 'selected', optionId } })
}

async function readTextFile(
  params: JsonValue | undefined,
): Promise<ResultType<JsonValue, JsonRpcError>> {
  const parsed = readFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    return Result.err({ code: -32602, message: 'invalid fs/read_text_file params' })
  }
  try {
    const raw = await readFile(parsed.data.path, 'utf8')
    return Result.ok({ content: sliceLines(raw, parsed.data.line, parsed.data.limit) })
  } catch (cause) {
    return Result.err({ code: -32000, message: fileErrorMessage(cause) })
  }
}

async function writeTextFile(
  params: JsonValue | undefined,
): Promise<ResultType<JsonValue, JsonRpcError>> {
  const parsed = writeFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    return Result.err({ code: -32602, message: 'invalid fs/write_text_file params' })
  }
  try {
    await mkdir(dirname(parsed.data.path), { recursive: true })
    await writeFile(parsed.data.path, parsed.data.content)
    return Result.ok({})
  } catch (cause) {
    return Result.err({ code: -32000, message: fileErrorMessage(cause) })
  }
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
