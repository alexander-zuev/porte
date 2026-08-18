import { defineRule } from '@oxlint/plugins'

function replacementFor(element: string): string | undefined {
  switch (element) {
    case 'button':
      return 'Button'
    case 'details':
      return 'Collapsible'
    case 'dialog':
      return 'Dialog'
    case 'fieldset':
      return 'FieldSet'
    case 'hr':
      return 'Separator'
    case 'input':
      return 'Input'
    case 'label':
      return 'Label'
    case 'legend':
      return 'FieldLegend'
    case 'select':
      return 'Select'
    case 'summary':
      return 'CollapsibleTrigger'
    case 'textarea':
      return 'Textarea'
    default:
      return undefined
  }
}

/** Require installed UI primitives instead of their native control elements. */
export const preferUiPrimitivesRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow native controls that have an installed design-system primitive.',
    },
    messages: {
      primitive:
        'Replace native `<{{element}}>` with the installed `{{component}}` primitive or customize that primitive.',
    },
  },
  createOnce(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return
        const element = node.name.name
        const component = replacementFor(element)
        if (!component) return
        context.report({
          node: node.name,
          messageId: 'primitive',
          data: { element, component },
        })
      },
    }
  },
})
