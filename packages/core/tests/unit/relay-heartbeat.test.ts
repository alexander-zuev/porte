import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_TIMEOUT_MS,
  RelayHeartbeat,
} from '../../src/relay/heartbeat.ts'

afterEach(() => vi.useRealTimers())

describe('RelayHeartbeat', () => {
  it('keeps checking after a response', () => {
    vi.useFakeTimers()
    let probes = 0
    const heartbeat = new RelayHeartbeat(
      () => probes++,
      () => undefined,
    )
    heartbeat.start()
    vi.advanceTimersByTime(RELAY_HEARTBEAT_INTERVAL_MS)
    heartbeat.acknowledge()
    vi.advanceTimersByTime(RELAY_HEARTBEAT_INTERVAL_MS)
    expect(probes).toBe(2)
    heartbeat.stop()
  })

  it('times out once and stops checking', () => {
    vi.useFakeTimers()
    let timeouts = 0
    const heartbeat = new RelayHeartbeat(
      () => undefined,
      () => timeouts++,
    )
    heartbeat.start()
    vi.advanceTimersByTime(RELAY_HEARTBEAT_INTERVAL_MS + RELAY_HEARTBEAT_TIMEOUT_MS)
    vi.advanceTimersByTime(RELAY_HEARTBEAT_INTERVAL_MS * 2)
    expect(timeouts).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the response deadline when stopped', () => {
    vi.useFakeTimers()
    let timeouts = 0
    const heartbeat = new RelayHeartbeat(
      () => undefined,
      () => timeouts++,
    )
    heartbeat.start()
    vi.advanceTimersByTime(RELAY_HEARTBEAT_INTERVAL_MS)
    heartbeat.stop()
    vi.advanceTimersByTime(RELAY_HEARTBEAT_TIMEOUT_MS)
    expect(timeouts).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
