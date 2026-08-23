import { CanonicalContentSchema, type CanonicalContent } from '@porte/core/client'
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@web/ui/components/ai-elements/attachments.tsx'
import { MessageResponse } from '@web/ui/components/ai-elements/message.tsx'
import { isDataUIPart, isFileUIPart, isReasoningFileUIPart, type UIMessage } from 'ai'

type MessagePart = UIMessage['parts'][number]

/** Renders canonical files and resources preserved in AI SDK message parts. */
export function ConversationContentPart({ part }: { readonly part: MessagePart }) {
  if (isFileUIPart(part) || isReasoningFileUIPart(part)) {
    const data = { ...part, id: part.url, type: 'file' as const }
    return (
      <Attachments variant="inline">
        <Attachment data={data}>
          <AttachmentPreview />
          <AttachmentInfo />
        </Attachment>
      </Attachments>
    )
  }
  if (part.type === 'source-url') {
    return <ResourceLink name={part.title ?? part.url} uri={part.url} />
  }
  if (!isDataUIPart(part) || !part.type.startsWith('data-porte-')) return null

  const content = CanonicalContentSchema.safeParse(part.data)
  return content.success ? <CanonicalContentPart content={content.data} /> : null
}

function CanonicalContentPart({ content }: { readonly content: CanonicalContent }) {
  if (content.type === 'text') return <MessageResponse>{content.text}</MessageResponse>
  if (content.type === 'image' || content.type === 'audio') {
    return (
      <FileContent
        mediaType={content.mimeType}
        url={`data:${content.mimeType};base64,${content.data}`}
      />
    )
  }
  if (content.type === 'resource-link') {
    return <ResourceLink name={content.title ?? content.name} uri={content.uri} />
  }
  if (content.resource.content.type === 'text') {
    return <MessageResponse>{content.resource.content.text}</MessageResponse>
  }
  return (
    <FileContent
      mediaType={content.resource.mimeType ?? 'application/octet-stream'}
      name={content.resource.uri}
      url={`data:${content.resource.mimeType ?? 'application/octet-stream'};base64,${content.resource.content.data}`}
    />
  )
}

function FileContent({
  mediaType,
  name,
  url,
}: {
  readonly mediaType: string
  readonly name?: string
  readonly url: string
}) {
  if (mediaType.startsWith('image/')) {
    return <img alt={name ?? 'Message attachment'} className="max-h-96 rounded-md" src={url} />
  }
  if (mediaType.startsWith('audio/')) return <ResourceLink name={name ?? 'Open audio'} uri={url} />
  return <ResourceLink name={name ?? 'Open attachment'} uri={url} />
}

function ResourceLink({ name, uri }: { readonly name: string; readonly uri: string }) {
  return (
    <a className="underline underline-offset-4" href={uri} rel="noreferrer" target="_blank">
      {name}
    </a>
  )
}
