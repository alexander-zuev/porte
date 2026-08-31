import { SparkleIcon, TerminalIcon } from '@phosphor-icons/react'
import { AGENT_PROMPT, PLUGIN_INSTALL_COMMANDS } from '@web/lib/product.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { toast } from 'sonner'

const INSTALL_COMMAND = PLUGIN_INSTALL_COMMANDS.join(' && ')

async function copyWithToast(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard is unavailable or denied; nothing to show for it.
    return
  }
  toast(message)
}

/**
 * The two setup paths: hand the prompt to an agent, or copy the install
 * command for the terminal. Both copy; the toast says where to paste.
 */
export function SetupActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        onClick={() => {
          void copyWithToast(AGENT_PROMPT, 'Prompt copied. Paste it into your agent.')
        }}
      >
        <SparkleIcon data-icon="inline-start" />
        Copy prompt
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          void copyWithToast(INSTALL_COMMAND, 'Command copied. Run it in your terminal.')
        }}
      >
        <TerminalIcon data-icon="inline-start" />
        Set up manually
      </Button>
    </div>
  )
}
