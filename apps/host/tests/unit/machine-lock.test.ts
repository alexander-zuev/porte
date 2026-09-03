import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileMachineLock } from '@host/infrastructure/persistence/machine-lock.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'porte-lock-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('FileMachineLock', () => {
  it('grants the lock to the first process', async () => {
    const lock = new FileMachineLock(directory)
    expect(await lock.acquire()).toEqual({ type: 'held' })
  })

  it('turns a second process away while the holder lives', async () => {
    const holder = new FileMachineLock(directory)
    await holder.acquire()

    const second = new FileMachineLock(directory)

    expect(await second.acquire()).toEqual({ type: 'held-elsewhere', pid: process.pid })
  })

  it('steals a lock whose holder is dead', async () => {
    // No process has this pid on any live system under test.
    await writeFile(join(directory, 'host.lock'), JSON.stringify({ pid: 2 ** 30 }))

    const lock = new FileMachineLock(directory)

    expect(await lock.acquire()).toEqual({ type: 'held' })
  })

  it('replaces a live holder from an older release: it is told to stop, then the lock is taken', async () => {
    // The holder is this process with an old version; `terminate` marks it gone instead of signalling.
    let holderAlive = true
    const holder = new FileMachineLock(directory, {
      version: '0.2.7',
      isAlive: () => true,
      terminate: () => undefined,
    })
    await holder.acquire()
    const terminated: number[] = []
    const newer = new FileMachineLock(directory, {
      version: '0.3.1',
      isAlive: () => holderAlive,
      terminate: (pid) => {
        terminated.push(pid)
        holderAlive = false
      },
    })

    expect(await newer.acquire()).toEqual({ type: 'replaced', pid: process.pid })
    expect(terminated).toEqual([process.pid])
  })

  it('treats a lock with no version as older, and a same-version holder as final', async () => {
    await writeFile(join(directory, 'host.lock'), JSON.stringify({ pid: process.pid }))
    const stopped: number[] = []
    const newer = new FileMachineLock(directory, {
      version: '0.3.1',
      isAlive: () => stopped.length === 0,
      terminate: (pid) => {
        stopped.push(pid)
      },
    })
    expect(await newer.acquire()).toEqual({ type: 'replaced', pid: process.pid })

    const peer = new FileMachineLock(directory, {
      version: '0.3.1',
      isAlive: () => true,
      terminate: () => {
        throw new Error('a peer must never be signalled')
      },
    })
    expect(await peer.acquire()).toEqual({ type: 'held-elsewhere', pid: process.pid })
  })

  it('releases idempotently and frees the lock for the next process', async () => {
    const first = new FileMachineLock(directory)
    await first.acquire()
    await first.release()
    await first.release()

    const second = new FileMachineLock(directory)

    expect(await second.acquire()).toEqual({ type: 'held' })
  })
})
