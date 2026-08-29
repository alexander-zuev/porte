import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@web/ui/components/ai-elements/attachments.tsx'
import type { FileUIPart } from 'ai'

/**
 * What was sent with a prompt, in one row above its words.
 *
 * A photo is its picture; anything else is named. The row scrolls sideways
 * rather than wrapping, so four photos take one line of the bubble, not four.
 */
export function MessageFiles({ files }: { readonly files: readonly FileUIPart[] }) {
  return (
    // Focusable, so the keyboard can scroll a row that overflows on a phone.
    // One row, one height, sideways only. No scrollbar is drawn: a bar inside
    // the row would take its own height off the tiles and cut them.
    <Attachments
      aria-label="Attached files"
      className="shrink-0 flex-nowrap overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      tabIndex={0}
    >
      {files.map((file) => {
        const data = { ...file, id: file.url }
        if (file.mediaType.startsWith('image/')) {
          return (
            <Attachment
              key={file.url}
              className="size-16 shrink-0 overflow-hidden rounded-lg p-0"
              data={data}
            >
              <AttachmentPreview className="size-full rounded-none" />
            </Attachment>
          )
        }
        return (
          <Attachment key={file.url} className="h-16 max-w-64 shrink-0 rounded-lg" data={data}>
            <AttachmentPreview />
            <AttachmentInfo />
          </Attachment>
        )
      })}
    </Attachments>
  )
}
