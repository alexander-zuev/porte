import { z } from 'zod'

const metaSchema = z.record(z.string(), z.json())

/** Optional ACP display hints preserved across the Porte boundary. */
export const ContentAnnotationsSchema = z.object({
  audience: z.array(z.enum(['assistant', 'user'])).optional(),
  lastModified: z.string().optional(),
  priority: z.number().optional(),
  _meta: metaSchema.optional(),
})

/** Optional ACP display hints preserved across the Porte boundary. */
export type ContentAnnotations = z.infer<typeof ContentAnnotationsSchema>

const contentMetadata = {
  annotations: ContentAnnotationsSchema.optional(),
  _meta: metaSchema.optional(),
}

const embeddedResourceSchema = z.object({
  uri: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  _meta: metaSchema.optional(),
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
  ...contentMetadata,
})

/** Provider-independent content that can cross the Porte protocol boundary. */
export const CanonicalContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string(), ...contentMetadata }),
  z.object({
    type: z.literal('image'),
    data: z.string(),
    mimeType: z.string().min(1),
    uri: z.string().min(1).optional(),
    ...contentMetadata,
  }),
  z.object({
    type: z.literal('audio'),
    data: z.string(),
    mimeType: z.string().min(1),
    ...contentMetadata,
  }),
  z.object({ type: z.literal('resource'), resource: embeddedResourceSchema, ...contentMetadata }),
  resourceLinkSchema,
])

/** Provider-independent content that can cross the Porte protocol boundary. */
export type CanonicalContent = z.infer<typeof CanonicalContentSchema>
