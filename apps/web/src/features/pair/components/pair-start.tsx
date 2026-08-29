import { LaptopIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { INSTALL_COMMAND, PAIR_COMMAND } from '@web/lib/product.ts'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

/**
 * Where an account with no machine lands.
 *
 * The commands come first because they are the only thing that can happen next,
 * and they happen somewhere else. Entering a code is the second half of that
 * same act, so it is a link rather than a field waiting to be filled.
 *
 * Installed rather than run through `npx`: `porte up` is a daemon started most
 * days, and every command Porte prints afterwards assumes it is on the path.
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
          Porte controls Grok on one machine. Run these in a terminal there, and the second prints a
          code to enter here.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <TerminalCommand command={INSTALL_COMMAND} />
        <TerminalCommand command={PAIR_COMMAND} />
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
