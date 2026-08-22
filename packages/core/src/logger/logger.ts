/**
 * Framework-independent logging utilities.
 * The logger writes structured production logs and readable development logs.
 */

type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Error
  | ReadonlyArray<LogValue>
  | LogFields

type LogFields = { readonly [key: string]: LogValue }

type ErrorLogContext = {
  readonly error?: unknown
  readonly userId?: string
  readonly details?: LogFields
}

type SerializedLogError = {
  readonly name: string
  readonly message: string
  readonly stack?: string
  readonly cause?: SerializedLogError | { readonly message: string }
  /** What an owned typed error carries beyond a message. Absent when it carries none. */
  readonly fields?: LogFields
}

type LogEntry = {
  readonly timestamp: string
  readonly level: LogLevel
  readonly module: string
  readonly message: string
  readonly data?: LogValue | SerializedLogError | ReadonlyArray<LogValue | SerializedLogError>
}

type RuntimeProcess = {
  readonly env: {
    readonly NODE_ENV?: string
    readonly LOG_LEVEL?: string
    readonly NO_COLOR?: string
    readonly FORCE_COLOR?: string
    readonly CI?: string
  }
  readonly stdout: { readonly isTTY: boolean }
}

/** The error data sent to the configured error hook. */
export interface ErrorCaptureEntry {
  readonly error: unknown
  readonly distinctId: string | undefined
  readonly context: LogFields
}

/** A function that forwards one logged error to an error service. */
export type LoggerErrorHook = (entry: ErrorCaptureEntry) => void

let errorHook: LoggerErrorHook | null = null

/** Register the function that receives each logged error. */
export function setLoggerErrorHook(fn: LoggerErrorHook): void {
  errorHook = fn
}

/** Where one formatted log line goes. */
export type LogSink = (level: LogLevel, line: string) => void

let logSink: LogSink | null = null

/**
 * Send every log somewhere other than `console`.
 *
 * Set once, at the process entry point, never per module: a logger is created
 * by name and nothing else, so where its lines go is a fact about the process
 * rather than about the module. `console` is the default because it is the only
 * sink a Worker or a browser has.
 */
export function setLogSink(fn: LogSink): void {
  logSink = fn
}

/** The supported log severity levels. */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/** Configuration values that override the environment defaults. */
export interface LoggerConfig {
  readonly logLevel?: LogLevel
  readonly colorize?: boolean
  readonly enabled?: boolean
}

const LOG_LEVELS = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] as const
const MAX_ERROR_CAUSE_DEPTH = 3

const getRuntimeProcess = (): RuntimeProcess | undefined => {
  if (!Reflect.has(globalThis, 'process')) return undefined

  // SAFETY: Reflect.has proves that globalThis contains the process property before this access.
  return (globalThis as typeof globalThis & { readonly process: RuntimeProcess }).process
}

const getNodeEnv = (): string => getRuntimeProcess()?.env.NODE_ENV ?? 'development'

const parseLogLevel = (value: string | undefined): LogLevel | undefined => {
  switch (value?.toUpperCase()) {
    case LogLevel.DEBUG:
      return LogLevel.DEBUG
    case LogLevel.INFO:
      return LogLevel.INFO
    case LogLevel.WARN:
      return LogLevel.WARN
    case LogLevel.ERROR:
      return LogLevel.ERROR
    default:
      return undefined
  }
}

const getMinLogLevel = (): LogLevel => {
  const configuredLevel = parseLogLevel(getRuntimeProcess()?.env.LOG_LEVEL)
  if (configuredLevel !== undefined) return configuredLevel

  switch (getNodeEnv()) {
    case 'production':
      return LogLevel.INFO
    case 'test':
      return LogLevel.ERROR
    default:
      return LogLevel.DEBUG
  }
}

const getLogConfig = () => {
  const minLevel = getMinLogLevel()

  switch (getNodeEnv()) {
    case 'production':
      return { enabled: true, minLevel, colorize: false }
    case 'test':
      return { enabled: false, minLevel, colorize: false }
    default:
      return { enabled: true, minLevel, colorize: true }
  }
}

/**
 * Diagnostics worth keeping off an error, named one by one.
 *
 * An allowlist rather than every own property: an error raised by a library we
 * do not control may hang a request or a user payload off itself, and a log is
 * the wrong place to discover that.
 *
 * `_tag` is how `better-result` discriminates, and the field that says which
 * failure this is. The three runtime flags are the ones Workers sets itself.
 */
type ErrorDiagnostics = Error & {
  readonly _tag?: LogValue
  readonly code?: LogValue
  readonly operation?: LogValue
  readonly status?: LogValue
  readonly statusCode?: LogValue
  readonly retryable?: LogValue
  readonly overloaded?: LogValue
  readonly durableObjectReset?: LogValue
}

/** Read those fields off one error. Absent when it carries none of them. */
const keptErrorFields = (error: Error): LogFields | undefined => {
  // Every field is optional, so an `Error` is already one of these.
  const carrier: ErrorDiagnostics = error
  const kept = Object.entries({
    _tag: carrier._tag,
    code: carrier.code,
    operation: carrier.operation,
    status: carrier.status,
    statusCode: carrier.statusCode,
    retryable: carrier.retryable,
    overloaded: carrier.overloaded,
    durableObjectReset: carrier.durableObjectReset,
  }).filter(([, value]) => value !== undefined)

  return kept.length === 0 ? undefined : Object.fromEntries(kept)
}

const serializeLogError = (error: Error, depth = 0): SerializedLogError => {
  if (depth > MAX_ERROR_CAUSE_DEPTH) {
    return { name: 'Error', message: '[cause chain truncated]' }
  }

  const base: SerializedLogError =
    depth === 0 && error.stack !== undefined
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: error.name, message: error.message }

  const fields = keptErrorFields(error)
  const described = fields === undefined ? base : { ...base, fields }
  if (error.cause === undefined) return described

  const cause =
    error.cause instanceof Error
      ? serializeLogError(error.cause, depth + 1)
      : { message: '[non-error cause]' }
  return { ...described, cause }
}

const serializeLogValue = (value: LogValue): LogValue | SerializedLogError =>
  value instanceof Error ? serializeLogError(value) : value

/**
 * The error and its details as the one object the log line carries.
 *
 * Both, because they answer different questions: the details say which call
 * this was, and the error says what went wrong inside it.
 */
const errorFields = (context: ErrorLogContext) => {
  const details = context.details ?? {}
  const thrown = context.error
  if (thrown === undefined) return details
  if (thrown instanceof Error) return { ...details, error: serializeLogError(thrown) }

  // Not an `Error`, so there is no name or stack to keep — only its shape.
  try {
    return { ...details, error: { message: JSON.stringify(thrown) } }
  } catch {
    return { ...details, error: { message: '[non-serializable error]' } }
  }
}

/**
 * Rescue an `Error` nested anywhere in a logged object.
 *
 * `JSON.stringify` has no enumerable properties to find on one, so without this
 * a cause tucked inside `details` writes itself as `{}`. Applied at the outer
 * boundary, so depth costs nothing to a caller.
 */
const errorReplacer = (_key: string, value: LogValue): LogValue | SerializedLogError =>
  serializeLogValue(value)

const formatDevelopmentArgs = (
  values: ReadonlyArray<LogValue>,
): ReadonlyArray<LogValue | SerializedLogError> => values.map(serializeLogValue)

const stringifyLogValues = (values: ReadonlyArray<LogValue | SerializedLogError>): string => {
  try {
    return JSON.stringify(values.length === 1 ? values[0] : values, errorReplacer)
  } catch {
    return '[Circular or non-serializable object]'
  }
}

const stringifyLogEntry = (entry: LogEntry): string => {
  try {
    return JSON.stringify(entry, errorReplacer)
  } catch {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      module: entry.module,
      message: entry.message,
      data: '[Circular or non-serializable object]',
    })
  }
}

const isBrowserRuntime = (): boolean => Reflect.has(globalThis, 'window')

const supportsAnsiColor = (): boolean => {
  const process = getRuntimeProcess()
  if (process === undefined) return false
  if (process.env.NO_COLOR !== undefined) return false
  if (process.env.FORCE_COLOR === '0') return false
  if (process.env.FORCE_COLOR !== undefined) return true
  if (getNodeEnv() === 'development' && process.env.CI === undefined) return true
  return process.stdout.isTTY
}

const ansi = {
  gray: (value: string) => `\x1b[90m${value}\x1b[0m`,
  dimCyan: (value: string) => `\x1b[2m\x1b[36m${value}\x1b[0m`,
  blue: (value: string) => `\x1b[34m${value}\x1b[0m`,
  yellow: (value: string) => `\x1b[33m${value}\x1b[0m`,
  boldRed: (value: string) => `\x1b[1m\x1b[31m${value}\x1b[0m`,
}

const colorizeLevelAnsi = (level: LogLevel): string => {
  switch (level) {
    case LogLevel.DEBUG:
      return ansi.dimCyan(level)
    case LogLevel.INFO:
      return ansi.blue(level)
    case LogLevel.WARN:
      return ansi.yellow(level)
    case LogLevel.ERROR:
      return ansi.boldRed(level)
    default:
      return level
  }
}

const levelStyles = {
  [LogLevel.DEBUG]: 'color: #5f9ea0',
  [LogLevel.INFO]: 'color: #61afef',
  [LogLevel.WARN]: 'color: #d4a843',
  [LogLevel.ERROR]: 'color: #e06c75; font-weight: 700',
} satisfies Record<LogLevel, string>

/** Write module-scoped logs with environment configuration. */
export class Logger {
  private readonly module: string
  private readonly config: ReturnType<typeof getLogConfig>

  /** Create a logger for one module. */
  constructor(module: string, overrideConfig?: LoggerConfig) {
    this.module = module
    this.config = getLogConfig()

    if (overrideConfig?.logLevel !== undefined) {
      this.config.minLevel = overrideConfig.logLevel
    }
    if (overrideConfig?.colorize !== undefined) {
      this.config.colorize = overrideConfig.colorize
    }
    if (overrideConfig?.enabled !== undefined) {
      this.config.enabled = overrideConfig.enabled
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false
    if (getNodeEnv() === 'production' && isBrowserRuntime()) return false

    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.config.minLevel)
  }

  /** One log as one line: readable at a terminal, structured everywhere else. */
  private line(
    level: LogLevel,
    timestamp: string,
    message: string,
    values: ReadonlyArray<LogValue>,
  ): string {
    const data = values.map(serializeLogValue)

    if (this.config.colorize && supportsAnsiColor()) {
      const prefix = `${ansi.gray(`[${timestamp}]`)} [${colorizeLevelAnsi(level)}] ${ansi.blue(
        `[${this.module}]`,
      )} ${message}`
      return data.length === 0 ? prefix : `${prefix} ${stringifyLogValues(data)}`
    }

    const base = { timestamp, level, module: this.module, message }
    if (values.length === 0) return stringifyLogEntry(base)

    return stringifyLogEntry({ ...base, data: data.length === 1 ? data[0] : data })
  }

  private log(level: LogLevel, message: string, values: ReadonlyArray<LogValue>): void {
    if (!this.shouldLog(level)) return

    const timestamp = new Date().toISOString()

    // A sink is handed one finished line. Console takes values as further
    // arguments so a browser can expand them; a stream cannot expand anything.
    if (logSink !== null) {
      logSink(level, this.line(level, timestamp, message, values))
      return
    }

    const logFunction =
      level === LogLevel.ERROR
        ? console.error
        : level === LogLevel.WARN
          ? console.warn
          : console.log

    if (this.config.colorize && isBrowserRuntime()) {
      logFunction(
        `%c[${timestamp}] %c[${level}] %c[${this.module}]%c ${message}`,
        'color: gray',
        levelStyles[level],
        'color: #61afef',
        'color: inherit',
        ...formatDevelopmentArgs(values),
      )
      return
    }

    if (this.config.colorize && supportsAnsiColor()) {
      logFunction(
        `${ansi.gray(`[${timestamp}]`)} [${colorizeLevelAnsi(level)}] ${ansi.blue(
          `[${this.module}]`,
        )} ${message}`,
        ...formatDevelopmentArgs(values),
      )
      return
    }

    const base = { timestamp, level, module: this.module, message }
    if (values.length === 0) {
      logFunction(stringifyLogEntry(base))
      return
    }

    const data = values.length === 1 ? serializeLogValue(values[0]) : values.map(serializeLogValue)
    logFunction(stringifyLogEntry({ ...base, data }))
  }

  /** Write a debug log. */
  debug(message: string, ...values: ReadonlyArray<LogValue>): void {
    this.log(LogLevel.DEBUG, message, values)
  }

  /** Write an information log. */
  info(message: string, ...values: ReadonlyArray<LogValue>): void {
    this.log(LogLevel.INFO, message, values)
  }

  /** Write a warning log. */
  warn(message: string, ...values: ReadonlyArray<LogValue>): void {
    this.log(LogLevel.WARN, message, values)
  }

  /** Write an error log, carrying the error itself, and send it to the configured hook. */
  error(message: string, context?: ErrorLogContext): void {
    this.log(LogLevel.ERROR, message, context === undefined ? [] : [errorFields(context)])

    if (errorHook !== null && context?.error !== undefined) {
      errorHook({
        error: context.error,
        distinctId: context.userId,
        context: context.details ?? {},
      })
    }
  }
}

/** Create a logger for one module. */
export function createLogger(module: string, config?: LoggerConfig): Logger {
  return new Logger(module, config)
}
