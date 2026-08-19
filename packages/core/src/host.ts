import { z } from 'zod'

/** Human-readable host identity returned to trusted clients. */
export const HostDescriptorSchema = z.object({
  name: z.string().min(1),
  platform: z.string().min(1),
})

/** Human-readable host identity returned to trusted clients. */
export type HostDescriptor = z.infer<typeof HostDescriptorSchema>
