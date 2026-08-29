import { ArrowsOutSimpleIcon, CheckIcon, CopyIcon } from '@phosphor-icons/react'
import {
  createCodePlugin,
  type HighlightOptions,
  type HighlightResult,
  type ThemeInput,
} from '@streamdown/code'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@web/ui/components/ui/dialog.tsx'
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/ui/components/ui/select.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import type { ComponentProps, CSSProperties, HTMLAttributes } from 'react'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * The one code theme, for every block on the page.
 *
 * Dark only, like the app. GitHub's current dark theme: the colours every
 * developer already reads diffs in, on a ground close to the page's grey.
 * Streamdown asks for a light and a dark theme; both slots hold this one.
 */
const CODE_THEME: ThemeInput = 'github-dark-default'

/**
 * The one highlighter: Streamdown's code plugin, shared with every markdown
 * on the page, so the app ships one copy of shiki and one theme.
 */
export const codePlugin = createCodePlugin({ themes: [CODE_THEME, CODE_THEME] })

type BundledLanguage = HighlightOptions['language']
type ThemedToken = HighlightResult['tokens'][number][number]

/** A fence can name any language; only the ones shiki has a grammar for get colour. */
const isBundledLanguage = (language: string): language is BundledLanguage =>
  codePlugin.getSupportedLanguages().some((one) => one === language)

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1
// oxlint-disable-next-line eslint(no-bitwise)
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2
const isUnderline = (fontStyle: number | undefined) =>
  // oxlint-disable-next-line eslint(no-bitwise)
  fontStyle && fontStyle & 4

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
interface KeyedToken {
  token: ThemedToken
  key: string
}
interface KeyedLine {
  tokens: KeyedToken[]
  key: string
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }))

// Token rendering component
const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        fontStyle: isItalic(token.fontStyle) ? 'italic' : undefined,
        fontWeight: isBold(token.fontStyle) ? 'bold' : undefined,
        textDecoration: isUnderline(token.fontStyle) ? 'underline' : undefined,
        ...token.htmlStyle,
      } as CSSProperties
    }
  >
    {token.content}
  </span>
)

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
  'block',
  'before:content-[counter(line)]',
  'before:inline-block',
  'before:[counter-increment:line]',
  'before:w-8',
  'before:mr-4',
  'before:text-right',
  'before:text-muted-foreground/50',
  'before:font-mono',
  'before:select-none',
)

// Line rendering component
const LineSpan = ({
  keyedLine,
  showLineNumbers,
}: {
  keyedLine: KeyedLine
  showLineNumbers: boolean
}) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : 'block'}>
    {keyedLine.tokens.length === 0
      ? '\n'
      : keyedLine.tokens.map(({ token, key }) => <TokenSpan key={key} token={token} />)}
  </span>
)

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string
  language: string
  showLineNumbers?: boolean
}

interface TokenizedCode {
  tokens: ThemedToken[][]
  fg: string
  bg: string
}

interface CodeBlockContextType {
  code: string
  language: string
}

// Context
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
  language: 'json',
})

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
  bg: 'transparent',
  fg: 'inherit',
  tokens: code.split('\n').map((line) =>
    line === ''
      ? []
      : [
          {
            color: 'inherit',
            content: line,
          } as ThemedToken,
        ],
  ),
})

const toTokenized = (result: HighlightResult): TokenizedCode => ({
  bg: result.bg ?? 'transparent',
  fg: result.fg ?? 'inherit',
  tokens: result.tokens,
})

/**
 * Tokens now if the plugin has them, else null and the callback later.
 * The plugin owns the shiki instance, its language loading, and its cache.
 */
export const highlightCode = (
  code: string,
  language: string,
  // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
  // A language shiki has no grammar for is shown as it is, in the block's own colours.
  if (!isBundledLanguage(language)) return createRawTokens(code)
  const result = codePlugin.highlight(
    { code, language, themes: codePlugin.getThemes() },
    callback === undefined ? undefined : (highlighted) => callback(toTokenized(highlighted)),
  )
  return result === null ? null : toTokenized(result)
}

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    className,
  }: {
    tokenized: TokenizedCode
    showLineNumbers: boolean
    className?: string
  }) => {
    const preStyle = useMemo(
      () => ({
        backgroundColor: tokenized.bg,
        color: tokenized.fg,
      }),
      [tokenized.bg, tokenized.fg],
    )

    const keyedLines = useMemo(() => addKeysToTokens(tokenized.tokens), [tokenized.tokens])

    return (
      <pre className={cn('m-0 p-4 text-sm', className)} style={preStyle}>
        <code
          className={cn(
            'font-mono text-sm',
            showLineNumbers && '[counter-increment:line_0] [counter-reset:line]',
          )}
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan key={keyedLine.key} keyedLine={keyedLine} showLineNumbers={showLineNumbers} />
          ))}
        </code>
      </pre>
    )
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.className === nextProps.className,
)

CodeBlockBody.displayName = 'CodeBlockBody'

export const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { language: string }) => (
  <div
    className={cn(
      'group relative w-full overflow-hidden rounded-xl border bg-background text-foreground',
      className,
    )}
    data-language={language}
    style={{
      containIntrinsicSize: 'auto 200px',
      contentVisibility: 'auto',
      ...style,
    }}
    {...props}
  />
)

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-muted-foreground text-xs',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-w-0 items-center gap-2', className)} {...props}>
    {children}
  </div>
)

export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('truncate font-mono', className)} {...props}>
    {children}
  </span>
)

export const CodeBlockActions = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('-my-1 -mr-1 flex shrink-0 items-center gap-2', className)} {...props}>
    {children}
  </div>
)

export const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false,
  className,
}: {
  code: string
  language: string
  showLineNumbers?: boolean
  className?: string
}) => {
  // Memoized raw tokens for immediate display
  const rawTokens = useMemo(() => createRawTokens(code), [code])

  // Synchronous cache lookup — avoids setState in effect for cached results
  const syncTokens = useMemo(
    () => highlightCode(code, language) ?? rawTokens,
    [code, language, rawTokens],
  )

  // Async highlighting result (populated after shiki loads)
  const [asyncTokens, setAsyncTokens] = useState<TokenizedCode | null>(null)
  const asyncKeyRef = useRef({ code, language })

  // Invalidate stale async tokens synchronously during render
  if (asyncKeyRef.current.code !== code || asyncKeyRef.current.language !== language) {
    asyncKeyRef.current = { code, language }
    setAsyncTokens(null)
  }

  useEffect(() => {
    let cancelled = false

    highlightCode(code, language, (result) => {
      if (!cancelled) {
        setAsyncTokens(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language])

  const tokenized = asyncTokens ?? syncTokens

  return (
    <div className="relative overflow-auto" tabIndex={0}>
      <CodeBlockBody
        className={className}
        showLineNumbers={showLineNumbers}
        tokenized={tokenized}
      />
    </div>
  )
}

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code, language }), [code, language])

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent code={code} language={language} showLineNumbers={showLineNumbers} />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  )
}

/** A block with its name, a copy button, and a way to read it full screen. */
export const TitledCodeBlock = ({ title, ...props }: CodeBlockProps & { title: string }) => (
  <CodeBlock {...props}>
    <CodeBlockHeader>
      <CodeBlockTitle>
        <CodeBlockFilename>{title}</CodeBlockFilename>
      </CodeBlockTitle>
      <CodeBlockActions>
        <CodeBlockCopyButton />
        <CodeBlockExpandButton title={title} />
      </CodeBlockActions>
    </CodeBlockHeader>
  </CodeBlock>
)

/**
 * The same code, given the whole screen: numbered lines, wrapped, scrolling.
 *
 * A sheet on a phone and a dialog on a desktop, so a long file is read where
 * there is room for it rather than through a slot in the transcript.
 */
export const CodeBlockExpandButton = ({ title }: { readonly title: string }) => {
  const { code, language } = useContext(CodeBlockContext)
  const phone = usePhone()
  const trigger = (
    <Button aria-label={`Open ${title} full screen`} size="icon" variant="ghost">
      <ArrowsOutSimpleIcon size={14} />
    </Button>
  )
  const body = (
    <CodeBlockContent
      className="whitespace-pre-wrap break-words"
      code={code}
      language={language}
      showLineNumbers
    />
  )

  if (phone) {
    return (
      <Drawer>
        <DrawerTrigger render={trigger} />
        <DrawerContent>
          <DrawerTitle className="px-4" render={<h3 className="truncate">{title}</h3>} />
          <div className="rounded-xl border bg-background mx-4">{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      </DialogContent>
    </Dialog>
  )
}

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)
  const { code } = useContext(CodeBlockContext)

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'))
      return
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code)
        setIsCopied(true)
        onCopy?.()
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout)
      }
    } catch (error) {
      onError?.(error as Error)
    }
  }, [code, onCopy, onError, timeout, isCopied])

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      aria-label={isCopied ? 'Copied' : 'Copy code'}
      className={cn('shrink-0', className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  )
}

export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>

export const CodeBlockLanguageSelector = (props: CodeBlockLanguageSelectorProps) => (
  <Select {...props} />
)

export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<typeof SelectTrigger>

export const CodeBlockLanguageSelectorTrigger = ({
  className,
  ...props
}: CodeBlockLanguageSelectorTriggerProps) => (
  <SelectTrigger
    className={cn('h-7 border-none bg-transparent px-2 text-xs shadow-none', className)}
    size="sm"
    {...props}
  />
)

export type CodeBlockLanguageSelectorValueProps = ComponentProps<typeof SelectValue>

export const CodeBlockLanguageSelectorValue = (props: CodeBlockLanguageSelectorValueProps) => (
  <SelectValue {...props} />
)

export type CodeBlockLanguageSelectorContentProps = ComponentProps<typeof SelectContent>

export const CodeBlockLanguageSelectorContent = ({
  align = 'end',
  ...props
}: CodeBlockLanguageSelectorContentProps) => <SelectContent align={align} {...props} />

export type CodeBlockLanguageSelectorItemProps = ComponentProps<typeof SelectItem>

export const CodeBlockLanguageSelectorItem = (props: CodeBlockLanguageSelectorItemProps) => (
  <SelectItem {...props} />
)
