import { z } from 'zod'

const embeddedResourceSchema = z.object({
  uri: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  content: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('blob'), data: z.string() }),
  ]),
})

const resourceLinkSchema = z.object({
  type: z.literal('resource-link'),
  uri: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().min(1).optional(),
  size: z.number().int().nonnegative().optional(),
})

/** Provider-independent content that can cross the Porte protocol boundary. */
export const CanonicalContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string().min(1) }),
  z.object({ type: z.literal('audio'), data: z.string(), mimeType: z.string().min(1) }),
  z.object({ type: z.literal('resource'), resource: embeddedResourceSchema }),
  resourceLinkSchema,
])

/** Provider-independent content that can cross the Porte protocol boundary. */
export type CanonicalContent = z.infer<typeof CanonicalContentSchema>
