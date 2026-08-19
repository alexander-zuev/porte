import { UserCircleIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { Button } from '#/ui/components/ui/button.tsx'

/** Account entry pinned to the base of the list pane. */
export function SessionListFooter({ label }: { readonly label: string }) {
  return (
    <div className="border-t border-border px-3 py-3">
      <Button
        className="w-full justify-start"
        nativeButton={false}
        variant="ghost"
        render={<Link to="/account" />}
      >
        <UserCircleIcon data-icon="inline-start" />
        <span className="truncate">{label}</span>
      </Button>
    </div>
  )
}
