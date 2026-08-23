import { describe, expect, it } from 'vitest'

import { HostOfflineError, shouldRetryFailure } from '../../src/index.ts'

describe('HostOfflineError', () => {
  it('stops retries until the host connection changes', () => {
    const error = new HostOfflineError()
    const retry = shouldRetryFailure({
      classification: error.classification,
      repeatSafe: true,
      owner: 'immediate',
    })

    expect(retry).toBe(false)
  })
})
