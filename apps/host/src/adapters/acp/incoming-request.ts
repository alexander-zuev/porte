import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import type { JsonRpcError, JsonValue } from './message.ts'

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

/** One validated ACP permission request. */
export type AcpPermissionRequest = z.infer<typeof permissionParamsSchema>

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
): Promise<ResultType<JsonValue, JsonRpcError>> {
  if (method === 'fs/read_text_file') {
    return readTextFile(cwd, params)
  }
  if (method === 'fs/write_text_file') {
    return writeTextFile(cwd, params)
  }
  return Result.err({ code: -32601, message: `method not found: ${method}` })
}

/** Parse one ACP permission request at the Grok boundary. */
export function parsePermissionRequest(
  params: JsonValue | undefined,
): ResultType<AcpPermissionRequest, JsonRpcError> {
  const parsed = permissionParamsSchema.safeParse(params)
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err({ code: -32602, message: 'invalid session/request_permission params' })
}

async function readTextFile(
  cwd: string,
  params: JsonValue | undefined,
): Promise<ResultType<JsonValue, JsonRpcError>> {
  const parsed = readFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    return Result.err({ code: -32602, message: 'invalid fs/read_text_file params' })
  }
  const path = resolveConversationPath(cwd, parsed.data.path)
  if (path.isErr()) return path
  try {
    const raw = await readFile(path.value, 'utf8')
    return Result.ok({ content: sliceLines(raw, parsed.data.line, parsed.data.limit) })
  } catch (cause) {
    return Result.err({ code: -32000, message: fileErrorMessage(cause) })
  }
}

async function writeTextFile(
  cwd: string,
  params: JsonValue | undefined,
): Promise<ResultType<JsonValue, JsonRpcError>> {
  const parsed = writeFileParamsSchema.safeParse(params)
  if (!parsed.success) {
    return Result.err({ code: -32602, message: 'invalid fs/write_text_file params' })
  }
  const path = resolveConversationPath(cwd, parsed.data.path)
  if (path.isErr()) return path
  try {
    await mkdir(dirname(path.value), { recursive: true })
    await writeFile(path.value, parsed.data.content)
    return Result.ok({})
  } catch (cause) {
    return Result.err({ code: -32000, message: fileErrorMessage(cause) })
  }
}

function resolveConversationPath(
  cwd: string,
  requestedPath: string,
): ResultType<string, JsonRpcError> {
  const root = resolve(cwd)
  const path = resolve(root, requestedPath)
  const fromRoot = relative(root, path)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return Result.err({ code: -32602, message: 'path is outside the conversation directory' })
  }
  return Result.ok(path)
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
