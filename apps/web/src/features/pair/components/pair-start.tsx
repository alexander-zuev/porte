import { LaptopIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { PLUGIN_INSTALL_COMMANDS, REMOTE_CONTROL_COMMAND } from '@web/lib/product.ts'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

/**
 * Where an account with no machine lands.
 *
 * The commands come first because they are the only thing that can happen next,
 * and they happen somewhere else. Entering a code is the second half of that
 * same act, so it is a link rather than a field waiting to be filled.
 */
export function PairStart() {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground">
          <LaptopIcon aria-hidden className="size-7" />
        </span>
        <h1>Pair your machine</h1>
        <p className="max-w-[46ch] text-muted-foreground">
          Porte controls Grok on one machine. Two steps there, and the second prints a code to enter
          here.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <small className="text-muted-foreground">In a terminal on that machine</small>
        <TerminalCommand command={PLUGIN_INSTALL_COMMANDS} />
        <small className="pt-2 text-muted-foreground">Then inside Grok</small>
        <TerminalCommand command={REMOTE_CONTROL_COMMAND} prompt=">" />
      </div>

      <Button
        className="min-h-11 self-start"
        nativeButton={false}
        variant="outline"
        render={<Link to="/pair/code" />}
      >
        I already have a code
      </Button>
    </div>
  )
}
