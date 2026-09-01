import type { ConversationAgentConnection } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import { useConversationCommands } from '@web/features/conversation/hooks/use-conversation-commands.ts'
import { usePromptInputController } from '@web/ui/components/ai-elements/prompt-input.tsx'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@web/ui/components/ui/command.tsx'

/** `/` plus a partial name and nothing else; a space means the command is chosen. */
const SLASH_QUERY = /^\/([\w:-]*)$/

export type ComposerCommandSuggestionsProps = {
  readonly agent: Pick<ConversationAgentConnection, 'name' | 'stub'>
}

/**
 * Command suggestions over the composer while the text is a bare `/query`.
 *
 * cmdk owns matching and ranking — the hidden input pins its search to what
 * the person typed, over each command's name and description. Picking one
 * puts `/name ` back into the composer; sending stays the person's move.
 */
export function ComposerCommandSuggestions({ agent }: ComposerCommandSuggestionsProps) {
  const controller = usePromptInputController()
  const slash = SLASH_QUERY.exec(controller.textInput.value)
  const commands = useConversationCommands(agent, slash !== null)
  if (slash === null) return null

  return (
    <div className="absolute inset-x-0 bottom-full z-10 mb-2">
      <Command className="rounded-xl border bg-popover shadow-md">
        <div className="hidden">
          <CommandInput
            label="Search commands"
            value={slash[1] ?? ''}
            onValueChange={() => undefined}
          />
        </div>
        <CommandList className="max-h-[40svh]">
          {commands.status === 'pending' ? (
            <CommandEmpty>Reading commands…</CommandEmpty>
          ) : commands.status === 'failed' ? (
            <CommandItem forceMount value="retry" onSelect={commands.onRetry}>
              Commands did not load. Retry
            </CommandItem>
          ) : (
            <>
              <CommandEmpty>No matching command</CommandEmpty>
              {commands.commands.map((command) => (
                <CommandItem
                  key={command.name}
                  keywords={[command.description]}
                  value={command.name}
                  onSelect={() => {
                    controller.textInput.setInput(`/${command.name} `)
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono">/{command.name}</span>
                    {command.description === '' ? null : (
                      <small className="truncate text-muted-foreground">
                        {command.description}
                      </small>
                    )}
                  </span>
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
