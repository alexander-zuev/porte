import { ArrowLeftIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Separator } from '@web/ui/components/ui/separator.tsx'

/**
 * Conversation identity, the Mac, and the way back.
 *
 * Title and path rather than a conversation, because the header renders before
 * the transcript has been read and must still name where the person is.
 */
export function ConversationHeader({
  title,
  cwd,
  hostName,
  connection,
}: {
  readonly title: string
  readonly cwd: string | null
  readonly hostName: string
  readonly connection: HostConnection
}) {
  return (
    <>
      <header className="flex flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 md:px-5 md:pt-4">
        <div className="flex items-center justify-between gap-4">
          <Button
            className="md:hidden"
            nativeButton={false}
            render={
              <Link to="/conversations">
                <ArrowLeftIcon data-icon="inline-start" />
                Conversations
              </Link>
            }
            variant="ghost"
          />
          <div className="ml-auto flex min-w-0 flex-col items-end gap-1">
            <strong className="max-w-44 truncate">{hostName}</strong>
            <HostStatus connection={connection} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate">{title}</h1>
          {cwd === null ? null : (
            <small className="truncate text-muted-foreground" title={cwd}>
              {cwd}
            </small>
          )}
        </div>
      </header>
      <Separator />
    </>
  )
}
