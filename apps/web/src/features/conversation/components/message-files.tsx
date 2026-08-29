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
    <Attachments aria-label="Attached files" className="flex-nowrap overflow-x-auto" tabIndex={0}>
      {files.map((file) => {
        const data = { ...file, id: file.url }
        if (file.mediaType.startsWith('image/')) {
          return (
            <Attachment
              key={file.url}
              className="size-20 shrink-0 overflow-hidden rounded-lg p-0"
              data={data}
            >
              <AttachmentPreview className="size-full rounded-none" />
            </Attachment>
          )
        }
        return (
          <Attachment key={file.url} className="max-w-64 shrink-0" data={data}>
            <AttachmentPreview />
            <AttachmentInfo />
          </Attachment>
        )
      })}
    </Attachments>
  )
}
