import { homedir } from 'node:os'

import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { ConversationIdSchema } from '@porte/core/client'
import type { ConversationItem } from '@porte/core/client'

import { AcpAgentProcess } from '../src/infrastructure/acp/acp-agent-process.ts'
import { AcpClientRequestError } from '../src/infrastructure/acp/error.ts'
import { GrokReplayMapper } from '../src/infrastructure/grok/grok-event-mapper.ts'

const SESSION_ID = '01a03ffe-f02b-7660-b33d-3b662ad3df28'

function textOf(item: ConversationItem): string {
  if (item.type !== 'message' && item.type !== 'reasoning') return ''
  return item.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

async function main(): Promise<void> {
  const shutdown = new AbortController()
  const replay = new GrokReplayMapper()
  const transport = await AcpAgentProcess.start({
    command: 'grok',
    args: ['--no-auto-update', 'agent', 'stdio'],
    cwd: homedir(),
    signal: shutdown.signal,
    onUpdate: (notification) => {
      replay.map(notification)
    },
    onRequest: async (_id, method) => {
      throw new AcpClientRequestError({ code: -32601, message: `spike ignored ${method}` })
    },
  })

  try {
    const initialized = await transport.request({
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          elicitation: { form: {}, url: {} },
          plan: {},
          session: { configOptions: { boolean: {} } },
        },
        clientInfo: { name: 'porte-spike', title: 'Porte spike', version: '0.0.0' },
      },
    })
    const auth = (initialized.authMethods ?? []).find(
      (method: { id?: string }) => method.id === 'cached_token',
    )
    if (auth !== undefined) {
      await transport.request({
        method: 'authenticate',
        params: { methodId: auth.id, _meta: { headless: true } },
      })
    }

    const listed = await transport.request({ method: 'session/list', params: {} })
    const session = listed.sessions.find(
      (row: { sessionId: string }) => row.sessionId === SESSION_ID,
    )
    if (session === undefined) throw new Error('session not in first list page')

    await transport.request({
      method: 'session/load',
      params: { sessionId: SESSION_ID, cwd: session.cwd, mcpServers: [] },
    })
    const view = replay.snapshot(ConversationIdSchema.parse(SESSION_ID))
    const messages = view.items.filter((item) => item.type === 'message')
    const last = messages.slice(-10).map((item) => ({
      role: item.role,
      text: textOf(item).slice(0, 500),
    }))
    process.stdout.write(
      JSON.stringify(
        { itemCount: view.items.length, messageCount: messages.length, last },
        null,
        2,
      ) + '\n',
    )
  } finally {
    await transport.stop()
    shutdown.abort()
  }
}

void main()
