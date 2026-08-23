/* oxlint-disable react(no-array-index-key) -- ACP tool content has no item identifier. */
import { ToolContentSchema } from '@porte/core/client'
import { ConversationContentPart } from '@web/features/conversation/components/conversation-content-part.tsx'
import { CodeBlock } from '@web/ui/components/ai-elements/code-block.tsx'
import { MessageResponse } from '@web/ui/components/ai-elements/message.tsx'
import { z } from 'zod'

const outputSchema = z.object({
  content: z.array(ToolContentSchema),
  rawOutput: z.json(),
})

/** Renders the complete ACP tool output through AI Elements. */
export function ConversationToolOutput({ output }: { readonly output: unknown }) {
  const parsed = outputSchema.safeParse(output)
  if (!parsed.success) return <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
  return (
    <div className="space-y-3">
      {parsed.data.content.map((item, index) => {
        if (item.type === 'content') {
          if (item.content.type === 'text') {
            return <MessageResponse key={String(index)}>{item.content.text}</MessageResponse>
          }
          return (
            <ConversationContentPart
              key={String(index)}
              part={{ type: 'data-porte-content', data: item.content }}
            />
          )
        }
        if (item.type === 'diff') {
          return <CodeBlock key={String(index)} code={item.newText} language="diff" />
        }
        return (
          <small key={String(index)} className="text-muted-foreground">
            Terminal {item.terminalId}
          </small>
        )
      })}
      {parsed.data.rawOutput === null ? null : (
        <CodeBlock code={JSON.stringify(parsed.data.rawOutput, null, 2)} language="json" />
      )}
    </div>
  )
}
