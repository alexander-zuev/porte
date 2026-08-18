import { defineRule } from '@oxlint/plugins'

type ForbiddenPattern = {
  kind: string
  pattern: RegExp
}

const FORBIDDEN_TYPOGRAPHY_CLASSES: readonly ForbiddenPattern[] = [
  {
    kind: 'font size',
    pattern:
      /(?:^|[^a-z-])text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[(?:length:)?(?:\d|calc\(|clamp\(|min\(|max\()|\(length:)(?:\/\S+)?(?:$|[^a-z0-9-])/,
  },
  {
    kind: 'font weight',
    pattern:
      /(?:^|[^a-z-])font-(?:thin|extralight|light|normal|regular|medium|semibold|bold|extrabold|black|\d{3}|\[|\()(?:$|[^a-z0-9-])/,
  },
  {
    kind: 'line height',
    pattern:
      /(?:^|[^a-z-])leading-(?:none|tight|snug|normal|relaxed|loose|\d+(?:\.\d+)?|\[|\()(?:$|[^a-z0-9-])/,
  },
  {
    kind: 'letter spacing',
    pattern:
      /(?:^|[^a-z-])tracking-(?:tighter|tight|normal|wide|wider|widest|\[|\()(?:$|[^a-z0-9-])/,
  },
]

const FORBIDDEN_INLINE_STYLES: readonly ForbiddenPattern[] = [
  { kind: 'font size', pattern: /\bfontSize\s*:/ },
  { kind: 'font weight', pattern: /\bfontWeight\s*:/ },
  { kind: 'line height', pattern: /\blineHeight\s*:/ },
  { kind: 'letter spacing', pattern: /\bletterSpacing\s*:/ },
]

function findForbiddenKind(source: string, patterns: readonly ForbiddenPattern[]): string | null {
  return patterns.find(({ pattern }) => pattern.test(source))?.kind ?? null
}

/** Require owned JSX to use semantic typography or approved display tokens. */
export const noTypographyOverridesRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow local typography utilities and inline type metrics outside the token layer.',
    },
    messages: {
      override:
        'Remove this {{kind}} override. Use h1-h6, p, small, or an approved text-display-* token.',
    },
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return
        const source = context.sourceCode.getText(node)
        let kind: string | null = null
        if (node.name.name === 'className') {
          kind = findForbiddenKind(source, FORBIDDEN_TYPOGRAPHY_CLASSES)
        } else if (node.name.name === 'style') {
          kind = findForbiddenKind(source, FORBIDDEN_INLINE_STYLES)
        }
        if (kind === null) return
        context.report({ node, messageId: 'override', data: { kind } })
      },
    }
  },
})
