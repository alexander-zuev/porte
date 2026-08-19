import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'

const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d+)?\b/
const LITERAL_COLOR = /(?:oklch\(|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b)/

function forbiddenColor(source: string): string | undefined {
  return source.match(RAW_TAILWIND_COLOR)?.[0] ?? source.match(LITERAL_COLOR)?.[0]
}

/** Require application code to express color through semantic design tokens. */
export const noRawColorsRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw palette utilities and literal colors outside the design-token stylesheets.',
    },
    messages: {
      rawColor:
        'Replace raw color "{{color}}" with a semantic design token such as foreground, muted, status-success, or destructive.',
    },
  },
  createOnce(context) {
    const check = (node: ESTree.Node, source: string) => {
      const color = forbiddenColor(source)
      if (color === undefined) return
      context.report({ node, messageId: 'rawColor', data: { color } })
    }

    return {
      Literal(node) {
        check(node, context.sourceCode.getText(node))
      },
      TemplateElement(node) {
        check(node, context.sourceCode.getText(node))
      },
    }
  },
})
