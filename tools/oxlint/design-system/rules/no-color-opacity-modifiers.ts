import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'

const COLOR_OPACITY_MODIFIER =
  /\b(?:bg|text|border|ring|fill|stroke)-[a-z][a-z0-9-]*\/(?:\d{1,3}|\[[^\]]+\])\b/

function opacityModifier(source: string): string | undefined {
  return source.match(COLOR_OPACITY_MODIFIER)?.[0]
}

/** Require app-owned UI to use complete semantic colors instead of ad-hoc alpha variants. */
export const noColorOpacityModifiersRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Tailwind color opacity modifiers in app-owned UI; define a semantic token for the complete color instead.',
    },
    messages: {
      opacityModifier:
        'Replace "{{utility}}" with a complete semantic color token. Opacity-based component states belong in the design-system primitive layer.',
    },
  },
  createOnce(context) {
    const check = (node: ESTree.Node, source: string) => {
      const utility = opacityModifier(source)
      if (utility === undefined) return
      context.report({ node, messageId: 'opacityModifier', data: { utility } })
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
