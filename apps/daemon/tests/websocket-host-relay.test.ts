import { describe, expect, it } from 'vitest'

import { retryDelayMs } from '../src/host/websocket-host-relay.ts'

describe('retryDelayMs', () => {
  it('uses bounded exponential delays', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([250, 500, 1_000, 2_000, 4_000, 5_000])
  })
})
