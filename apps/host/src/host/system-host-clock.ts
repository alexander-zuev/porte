import { IsoDateTimeSchema, type IsoDateTime } from '@porte/core'

import type { HostClock } from './connect-host.ts'

/** System clock that returns timestamps from the current process. */
export class SystemHostClock implements HostClock {
  /** Return the current time as a valid protocol timestamp. */
  now(): IsoDateTime {
    return IsoDateTimeSchema.parse(new Date().toISOString())
  }
}
