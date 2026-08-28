import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MusicNoteIcon,
  VideoCameraIcon,
  XIcon,
} from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { FileUIPart, SourceDocumentUIPart } from 'ai'
import { createContext, useContext, useMemo, type ComponentProps } from 'react'

export type AttachmentData =
  | (FileUIPart & { readonly id: string })
  | (SourceDocumentUIPart & { readonly id: string })

type AttachmentContextValue = { readonly data: AttachmentData }
const AttachmentContext = createContext<AttachmentContextValue | null>(null)

/** AI Elements attachment collection. */
export function Attachments({
  className,
  variant: _variant,
  ...props
}: ComponentProps<'div'> & { readonly variant?: 'grid' | 'inline' | 'list' }) {
  return <div className={cn('flex flex-wrap gap-2', className)} {...props} />
}

/** One transcript attachment. */
export function Attachment({
  data,
  className,
  ...props
}: ComponentProps<'div'> & { readonly data: AttachmentData }) {
  const value = useMemo(() => ({ data }), [data])
  return (
    <AttachmentContext.Provider value={value}>
      <div
        className={cn(
          'flex min-h-11 max-w-full items-center gap-2 rounded-md border px-3 py-2',
          className,
        )}
        {...props}
      />
    </AttachmentContext.Provider>
  )
}

/** Shows an image or one media-type icon. */
export function AttachmentPreview({ className, ...props }: ComponentProps<'div'>) {
  const { data } = useAttachment()
  if (data.type === 'file' && data.mediaType.startsWith('image/')) {
    return (
      <img
        alt={data.filename ?? 'Image'}
        className={cn('size-10 rounded object-cover', className)}
        src={data.url}
      />
    )
  }
  const Icon = iconFor(data.mediaType)
  return (
    <div
      className={cn('flex size-10 items-center justify-center rounded bg-muted', className)}
      {...props}
    >
      <Icon aria-hidden className="size-5 text-muted-foreground" />
    </div>
  )
}

/** Shows the attachment name and media type. */
export function AttachmentInfo({ className, ...props }: ComponentProps<'div'>) {
  const { data } = useAttachment()
  return (
    <div className={cn('min-w-0', className)} {...props}>
      <span className="block truncate text-sm font-medium">{attachmentName(data)}</span>
      <span className="block truncate text-xs text-muted-foreground">{data.mediaType}</span>
    </div>
  )
}

/** Takes one attachment out of the set it sits in. Named after the file, so a row of X buttons reads apart. */
export function AttachmentRemove({
  onRemove,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> & {
  readonly onRemove: () => void
}) {
  const { data } = useAttachment()
  return (
    <Button
      aria-label={`Remove ${attachmentName(data)}`}
      className={cn('shrink-0', className)}
      size="icon-xs"
      type="button"
      variant="ghost"
      onClick={onRemove}
      {...props}
    >
      <XIcon aria-hidden />
    </Button>
  )
}

function attachmentName(data: AttachmentData): string {
  return data.type === 'source-document' ? data.title : (data.filename ?? 'attachment')
}

function useAttachment(): AttachmentContextValue {
  const value = useContext(AttachmentContext)
  if (value === null) throw new TypeError('Attachment parts require Attachment')
  return value
}

function iconFor(mediaType: string) {
  if (mediaType.startsWith('audio/')) return MusicNoteIcon
  if (mediaType.startsWith('video/')) return VideoCameraIcon
  if (mediaType.startsWith('text/') || mediaType.startsWith('application/')) return FileTextIcon
  if (mediaType.startsWith('image/')) return ImageIcon
  return FileIcon
}
