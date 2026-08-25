# Porte Host Architecture

> Source: Grok recommendation.

A local CLI (`porte`) connects a machine to a remote control plane. It runs coding agents such as Grok, Claude, and Codex on that machine. The control plane drives sessions. The host streams agent output back.

This document describes the design of the host process, not the server UI.

## 1. What the host is

```text
Control plane (operator UI / PartyKit)
        │  control protocol over PartySocket
        ▼
   porte CLI   ← this process
        │  engine protocol (ACP for Grok, …)
        ▼
   Agent subprocess (grok acp, claude, codex, …)
```

The host is an ACP client with a remote operator. It is not a WebSocket-to-standard-input pipe.

- The server uses a small control protocol (`host.*` and `session.*`).
- The host owns agent behavior, process creation, session lifecycles, permissions, the local file system, and the terminal.
- The agent is a child process. ACP is an infrastructure detail.

`porte run` brings the process to the Idle and connected state. It does not start a conversation or an agent.

## 2. Layer rules

```text
entrypoints  ──►  application  ──►  domain
                      ▲
                      │
                infrastructure
```

| Layer              | May know                                                                 | Must not know                                     |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------- |
| **domain**         | Session state machine, prompts, permissions, errors                      | PartySocket, ACP, `child_process`, JSON-RPC, argv |
| **application**    | Use cases, ports, actor mailbox, lifespan                                | `ws`, `@agentclientprotocol/sdk`, PartyKit rooms  |
| **infrastructure** | PartySocket, ACP standard input and output, process creation, Zod frames | Session transition rules                          |
| **entrypoints**    | argv, signals, composition root                                          | `PermissionRequest`, ACP methods                  |

All dependencies point inward. Only the composition root creates concrete adapters.

## 3. Directory map

```text
src/
  domain/
    host/
      HostStatus.ts
      HostIdentity.ts
      HostCapabilities.ts
    session/
      Session.ts              # aggregate root
      SessionId.ts
      SessionStatus.ts
      Turn.ts
      Prompt.ts
      ToolCall.ts
    permission/
      PermissionRequest.ts
      PermissionDecision.ts
      SessionPolicy.ts
    events/
      AgentEvent.ts           # discriminated union
      SessionEvent.ts
    errors/
      DomainError.ts

  application/
    HostRuntime.ts            # process supervisor and lifespan
    FrameRouter.ts
    SessionSupervisor.ts
    SessionActor.ts
    lifespan/
      ResourceStack.ts
    ports/
      OperatorPort.ts
      AgentPort.ts
      AgentFactory.ts
      AgentProcessPort.ts
      EngineProbePort.ts
      HostFsPort.ts
      HostTerminalPort.ts
      ClockPort.ts
      LoggerPort.ts
    usecases/
      StartSession.ts
      SubmitPrompt.ts
      CancelTurn.ts
      DecidePermission.ts
      CloseSession.ts

  infrastructure/
    websocket/
      PartySocketOperatorChannel.ts
      WireCodec.ts
      frames.ts               # Zod inbound and outbound schemas
      ExponentialBackoff.ts
      OutboundBuffer.ts
    engines/
      EngineRegistry.ts       # Grok, Claude, and Codex specifications
      EngineProbe.ts
      ProcessAgentFactory.ts
      ChildAgentHandle.ts
    acp/
      AcpAgentAdapter.ts
      AcpStdioTransport.ts
      AcpTranslator.ts
    grok/                     # only if Grok needs more than EngineSpec
    claude/
    codex/
    fs/
      LocalFsAdapter.ts
    terminal/
      LocalTerminalAdapter.ts
    logging/
      ConsoleLogger.ts
    clock/
      SystemClock.ts

  entrypoints/
    cli/
      main.ts
      CliArgs.ts
      CompositionRoot.ts
      SignalHandler.ts
```

## 4. Domain

The only aggregate after Idle is `Session`. A connected host with no sessions has no `Session` object.

### Host

The host is a small process-level model.

```ts
type HostStatus =
  | 'Created'
  | 'Connecting'
  | 'Idle' // WebSocket is open and there are zero sessions
  | 'Running'
  | 'RunningDegraded' // Sessions are live and the operator is down
  | 'Reconnecting'
  | 'Stopping'
  | 'Stopped'
  | 'Failed'

class HostIdentity {
  constructor(
    readonly hostId: HostId, // Stable value in ~/.porte/host-id
    readonly hostname: string,
    readonly os: 'darwin' | 'linux' | 'win32',
  ) {}
}

class HostCapabilities {
  constructor(
    readonly engines: EngineName[],
    readonly fs: boolean,
    readonly terminal: boolean,
  ) {}
}

type EngineName = 'grok' | 'claude' | 'codex'
```

### Session

`Session` is the conversation-level model.

```ts
type SessionStatus =
  'Starting' | 'Ready' | 'Prompting' | 'AwaitingPermission' | 'Canceling' | 'Closed' | 'Failed'

class Session {
  constructor(
    readonly id: SessionId, // Operator-facing ID selected by the server
    readonly engine: EngineName,
  ) {}

  status: SessionStatus = 'Starting'
  currentTurn: Turn | null = null
  pendingPermission: PermissionRequest | null = null

  beginTurn(prompt: Prompt): void
  apply(event: AgentEvent): void
  decide(optionId: string): PermissionRequest
  beginCancel(): void
  completeTurn(stop: StopReason): void
  fail(reason: string): void
  close(): void
}
```

Illegal transitions throw `DomainError`. These transitions are illegal:

- A prompt starts while the session is `Starting`, `Prompting`, `AwaitingPermission`, or `Closed`.
- A decision targets a permission that is not pending.
- A stream event applies to an idle session.

The domain never imports ports. Ports belong to the application layer.

## 5. Application ports

### Operator

The operator is the control plane.

```ts
interface OperatorPort {
  connect(): Promise<void>
  send(msg: OutboundMessage): Promise<void>
  close(): Promise<void>
  onCommand(cb: (cmd: InboundFrame) => void): void
  onConnection(cb: (ev: ConnectionEvent) => void): void
}

type ConnectionEvent =
  | { type: 'up'; generation: number; connectionId: ConnectionId }
  | { type: 'down'; retrying: boolean; code: number; reason: string }
```

`connect()` resolves after the first authenticated connection opens. PartySocket types do not cross this port.

### Agent

The agent port does not depend on one engine.

```ts
interface AgentPort {
  initialize(): Promise<AgentInfo>
  newConversation(p: NewConversation): Promise<ConversationId>
  generate(id: ConversationId, prompt: Prompt): Promise<StopReason>
  cancel(id: ConversationId): Promise<void>
  respondPermission(pending: PendingPermission, d: PermissionDecision): Promise<void>
  close(id: ConversationId): Promise<void>
  onEvent(cb: (e: AgentEvent) => void): void
  bindClientHandlers(h: { fs: HostFsPort; terminal: HostTerminalPort }): void
}

interface AgentFactory {
  create(spec: EngineLaunch): Promise<AgentHandle>
}

interface AgentHandle {
  port: AgentPort
  onExit(cb: (code: number | null) => void): void
  kill(signal: 'SIGTERM' | 'SIGKILL'): Promise<void>
}
```

For Grok, `generate()` maps to ACP `session/prompt`. Other adapters map it to their engine's turn operation.

`SessionActor` does not know the engine method. The actor maps the operator `sessionId` to the engine `ConversationId`.

## 6. Control protocol

The transport contains text. The protocol uses a versioned envelope. Handlers never read `event.data`.

```ts
type Envelope = {
  v: 1
  id: string
  type: string
  payload: unknown
  ts: number
  replyTo?: string
}
```

Every message has an ID. Commands use the ID for duplicate handling and acknowledgements.

The host accepts text frames only. An unknown `type` returns `host.error` with `code: "unknown_type"`.

Bad JSON does not stop the process.

### Traffic classes

| Class   | Examples                                               | Delivery                                                                     |
| ------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Command | `session.start`, `session.prompt`, `permission.decide` | `ack` or `nack` with `replyTo`. IDs make commands repeat-safe.               |
| Event   | `session.event`, `host.ready`                          | Fire-and-forget. Backpressure can drop events except `permission.requested`. |

The PartySocket offline queue is not an acknowledgement. A successful `send()` only means the client library accepted the bytes.

### Inbound messages

```text
host.ping
host.shutdown
session.start     { sessionId, engine, cwd, mode, mcpServers? }
session.prompt    { sessionId, blocks[] }
session.cancel    { sessionId }
session.permission.decide { sessionId, requestId, optionId }
session.close     { sessionId }
```

### Outbound messages

```text
host.register     { hostId, hostname, os, engines[], fs, terminal }
host.registered
host.ready        { status }
host.pong
host.error
ack / nack
session.ready
session.event     { sessionId, event }
session.permission.requested
session.ended
session.failed
```

ACP method names never appear in this protocol.

### Legal messages while Idle

The server can send `host.ping`, `host.shutdown`, and `session.start` while the host is Idle.

`session.prompt` before `session.ready` returns `nack` with `code: "session_not_found"`. A prompt never starts a session.

## 7. Scenario A: `porte run`

The result is one connected process in the Idle state. There is no agent child or `Session`.

### Entrypoint

```ts
async function main(argv: string[]) {
  const args = CliArgs.parse(argv)
  const runtime = CompositionRoot.build(args)

  const signals = new SignalHandler()
  signals.onStop((reason) => runtime.stop(reason))
  process.stdin.on('end', () => runtime.stop('stdin-eof'))

  await using _ = runtime
  await runtime.stopped
}
```

### Composition root

Only the composition root creates concrete adapters.

```ts
static build(args: CliArgs): HostRuntime {
  const log = new ConsoleLogger(args.logLevel)
  const clock = new SystemClock()
  const probe = new EngineProbe(ENGINES)
  const factory = new ProcessAgentFactory(ENGINES, log)
  const codec = new WireCodec()
  const identity = HostIdentity.loadOrCreate()

  const operator = new PartySocketOperatorChannel({
    host: args.server,
    token: args.token,
    hostId: identity.hostId,
    codec,
    log,
  })

  const sessions = new SessionSupervisor({ factory, operator, clock, log })
  return new HostRuntime({ operator, sessions, probe, identity, clock, log })
}
```

PartySocket uses `startClosed: true`. Nothing connects until the lifespan starts.

### Lifespan

```ts
class HostRuntime implements AsyncDisposable {
  status: HostStatus = 'Created'

  async start() {
    this.status = 'Connecting'
    this.operator.onCommand((frame) => this.router.dispatch(frame))
    this.operator.onConnection((ev) => this.onConnection(ev))
    await this.operator.connect()
  }

  private async onConnection(ev: ConnectionEvent) {
    if (ev.type === 'up') {
      const caps = await this.probe.all()
      await this.operator.send({
        type: 'host.register',
        payload: {
          hostId: this.identity.hostId,
          engines: caps.engines,
          fs: true,
          terminal: true,
        },
      })
      this.status = this.sessions.size === 0 ? 'Idle' : 'Running'
      await this.operator.send({
        type: 'host.ready',
        payload: { status: this.status },
      })
      return
    }

    if (ev.type === 'down' && ev.retrying) {
      this.status = this.sessions.size ? 'RunningDegraded' : 'Reconnecting'
      this.sessions.onOperatorDown()
      return
    }

    if (ev.type === 'down' && !ev.retrying) {
      await this.stop(ev.code === 4002 ? 'replaced' : 'operator_fatal')
    }
  }
}
```

### Probe and process creation

|                  | `engine --version`    | ACP `initialize` |
| ---------------- | --------------------- | ---------------- |
| When             | `porte run`           | `session.start`  |
| Process          | Start, wait, and exit | Long-lived       |
| Uses ACP         | No                    | Yes              |
| Needs cwd or MCP | No                    | Yes              |

The host advertises `engines: []` when no engine is installed. The control plane can then show an installation action.

### Process tree after `porte run`

```text
porte
 └── PartySocket connection
      └── Idle, dispatching pings
```

`ProcessAgentFactory.create` has not run. `SessionActor` does not exist.

## 8. Scenario B: user sends a prompt

`session.start` has already completed. The supervisor has created the engine process and conversation.

The actor is `Ready`, and the UI has received `session.ready`. A prompt for a missing session returns a nack.

### 1. Ingress

PartySocket delivers a string. The codec parses it.

```ts
private onMessage(raw: unknown) {
  const env = this.codec.decode(raw)
  if (!env.ok) {
    this.send({ type: "host.error", payload: { code: env.error } })
    return
  }
  const parsed = Inbound.safeParse({ type: env.value.type, payload: env.value.payload })
  if (!parsed.success) {
    this.send({ type: "host.error", replyTo: env.value.id, payload: { code: "bad_payload" } })
    return
  }
  this.commandCb({ ...parsed.data, id: env.value.id })
}
```

The decoded command has this shape:

```ts
{
  id: "cmd_9f3",
  type: "session.prompt",
  payload: {
    sessionId: "ses_1",
    blocks: [{ type: "text", text: "explain this repo" }]
  }
}
```

### 2. Router, supervisor, and mailbox

```ts
async dispatch(frame: InboundFrame) {
  try {
    switch (frame.type) {
      case "host.ping":
        await this.host.pong(frame)
        break
      case "session.start":
        await this.sessions.start(frame.payload, { commandId: frame.id })
        break
      case "session.prompt":
        await this.sessions.route(frame.payload.sessionId, {
          type: "SubmitPrompt",
          commandId: frame.id,
          prompt: Prompt.fromBlocks(frame.payload.blocks),
        })
        break
      case "session.permission.decide":
      case "session.cancel":
      case "session.close":
        await this.sessions.route(frame.payload.sessionId, toActorMessage(frame))
        break
      default:
        await this.host.nack(frame.id, { code: "unknown_type" })
    }
  } catch (e) {
    await this.host.nack(frame.id, toAppError(e))
  }
}

async route(sessionId: SessionId, msg: ActorMessage) {
  const actor = this.actors.get(sessionId)
  if (!actor) throw new AppError("session_not_found")
  await actor.mailbox.push(msg)
}
```

### 3. Actor

One queue owns one turn. `SubmitPrompt` and `AgentEvent` use the same handler.

This order prevents a permission RPC from racing a second prompt.

```ts
class SessionActor {
  constructor(
    readonly id: SessionId,
    private session: Session,
    private conversationId: ConversationId,
    private agent: AgentPort,
    private operator: OperatorPort,
  ) {}

  async handle(msg: ActorMessage) {
    switch (msg.type) {
      case 'SubmitPrompt':
        return this.submitPrompt(msg)
      case 'AgentEvent':
        return this.onAgentEvent(msg.event)
      case 'PermissionDecision':
        return this.decide(msg)
      case 'Cancel':
        return this.cancel()
      case 'Shutdown':
        return this.close()
    }
  }

  private async submitPrompt(msg: SubmitPrompt) {
    this.session.beginTurn(msg.prompt)

    await this.operator.send({ type: 'ack', replyTo: msg.commandId, payload: { accepted: true } })
    await this.operator.send({
      type: 'session.event',
      payload: { sessionId: this.id, event: { type: 'turn.started' } },
    })

    const stop = await this.agent.generate(this.conversationId, msg.prompt)

    this.session.completeTurn(stop)
    await this.operator.send({
      type: 'session.event',
      payload: { sessionId: this.id, event: { type: 'turn.completed', stopReason: stop } },
    })
  }

  private async onAgentEvent(event: AgentEvent) {
    this.session.apply(event)

    if (event.type === 'permission.requested') {
      await this.operator.send({
        type: 'session.permission.requested',
        payload: {
          sessionId: this.id,
          requestId: event.permission.requestId,
          toolCall: event.permission.toolCall,
          options: event.permission.options,
        },
      })
      return
    }

    await this.operator.send({
      type: 'session.event',
      payload: { sessionId: this.id, event: toWire(event) },
    })
  }
}
```

The host acknowledges the prompt when it accepts the turn. It does not wait for the turn to end.

The host streams `session.event` messages and finishes with `turn.completed`.

### 4. Grok ACP adapter

```ts
async generate(id: ConversationId, prompt: Prompt): Promise<StopReason> {
  const result = await this.transport.request("session/prompt", {
    sessionId: id.toAcp(),
    prompt: prompt.toAcpBlocks(),
  })
  return StopReason.fromAcp(result.stopReason)
}
```

Standard input and output can deliver other messages while this RPC is open. These messages are not the return value of `generate()`.

```ts
private onRpc(msg: JsonRpc) {
  if (msg.method === "session/update") {
    this.mailbox.push({ type: "AgentEvent", event: translator.toDomain(msg.params) })
    return
  }
  if (msg.method === "session/request_permission") {
    this.pendingRpc.set(msg.id, msg)
    this.mailbox.push({
      type: "AgentEvent",
      event: PermissionRequested.fromAcp(msg.id, msg.params),
    })
    return
  }
  if (msg.method === "fs/read_text_file") {
    this.fs.read(msg.params).then(
      content => this.reply(msg.id, { content }),
      err => this.rpcError(msg.id, err),
    )
    return
  }
}
```

The host executes `fs/*` and `terminal/*` methods. It sends tool call updates to the server.

It does not send each file read through the control plane.

### 5. Permission

An ACP permission is an RPC, not a notification. The turn does not continue until the host answers the RPC.

```ts
private async decide(msg: PermissionDecision) {
  const pending = this.session.decide(msg.optionId)
  await this.agent.respondPermission(pending, msg.decision)
}
```

If cancellation occurs during a permission request, the host answers `Cancelled` first. The host then sends `session/cancel`.

If the operator remains down past `permissionTimeout`, the host cancels the permission locally. This action prevents the agent from waiting forever.

### 6. UI event order

```text
ack                            replyTo: cmd_9f3
session.event                  turn.started
session.event                  text.delta
session.event                  tool_call
session.permission.requested   (optional)
session.event                  tool_call.update
session.event                  text.delta
session.event                  turn.completed { stopReason }
```

## 9. `session.start`

`session.start` creates the first engine process. `porte run` does not create it.

```ts
case "session.start": {
  if (!this.caps.engines.includes(cmd.engine)) {
    return this.nack(cmd.id, { code: "engine_unavailable", engine: cmd.engine })
  }
  await this.sessions.start(cmd, { commandId: cmd.id })
}

async start(cmd: StartSession, meta: { commandId: string }) {
  const handle = await this.factory.create({
    engine: cmd.engine,
    cwd: cmd.cwd,
    env: cmd.env,
  })
  const agent = handle.port
  agent.bindClientHandlers({ fs: new LocalFsAdapter(cmd.cwd), terminal: new LocalTerminalAdapter() })
  agent.onEvent(e => actor.mailbox.push({ type: "AgentEvent", event: e }))

  await agent.initialize()
  const conversationId = await agent.newConversation({
    cwd: cmd.cwd,
    mcpServers: cmd.mcpServers ?? [],
    mode: cmd.mode,
  })

  const session = new Session(cmd.sessionId, cmd.engine)
  session.status = "Ready"
  const actor = new SessionActor({ id: cmd.sessionId, session, conversationId, agent, operator: this.operator })
  this.actors.set(cmd.sessionId, actor)

  handle.onExit(code => actor.mailbox.push({ type: "AgentExited", code }))

  await this.operator.send({
    type: "session.ready",
    replyTo: meta.commandId,
    payload: { sessionId: cmd.sessionId, engine: cmd.engine },
  })
}
```

The process model uses one agent process per session. This model isolates the working directory, environment, and MCP configuration.

An agent failure moves the domain to `Failed` and emits `session.failed`. The host does not restart the agent automatically.

An automatic restart loses agreement about conversation history.

## 10. Multiple engines

Grok, Claude, and Codex create a process, create a conversation, and generate turns. They do not use the same process protocol.

Shared behavior belongs in `AgentPort`. Engine specifications and adapters own differences.

`SessionActor` never branches on the engine name.

```ts
const ENGINES: Record<EngineName, EngineSpec> = {
  grok: { bin: 'grok', args: ['acp'], protocol: 'acp', probe: ['--version'] },
  claude: { bin: 'claude', args: ['acp'], protocol: 'acp', probe: ['--version'] },
  codex: { bin: 'codex', args: ['app-server'], protocol: 'codex-app-server', probe: ['--version'] },
}

class ProcessAgentFactory implements AgentFactory {
  async create(launch: EngineLaunch): Promise<AgentHandle> {
    const spec = ENGINES[launch.engine]
    const child = spawn(spec.bin, spec.args, {
      cwd: launch.cwd,
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    const port =
      spec.protocol === 'acp'
        ? new AcpAgentAdapter(new AcpStdioTransport(child))
        : new CodexAppServerAdapter(new NdjsonTransport(child))
    return new ChildAgentHandle(child, port)
  }
}
```

| Shared                         | Per engine                                 |
| ------------------------------ | ------------------------------------------ |
| `Session` state machine        | argv, environment, and binary              |
| `SessionActor` mailbox         | Standard input and output protocol         |
| Operator frames                | Initialize payload and vendor capabilities |
| Permission policy shape        | Default Ask or automatic permission        |
| File system and terminal ports | Whether the engine delegates them          |
| Process tree termination       | How ready state appears on standard error  |
| PartySocket                    | API keys in the environment                |

If all engines use ACP, one `AcpAgentAdapter` can serve three `EngineSpec` values. `AgentPort` remains necessary for future engine differences.

`host.register` advertises the available engines. The server must start only an advertised engine.

## 11. Lifespan

There is no lifespan decorator. `HostRuntime` owns the lifespan.

```ts
await using runtime = await HostRuntime.start(deps)
await runtime.stopped
```

The resource stack releases resources in the reverse order of acquisition. One disposal failure must not stop later disposal operations.

```text
startup:  signals → PartySocket.connect → host.register → Idle
running:  acquire sessions on session.start and add them to the stack
shutdown: sessions and agents → session.ended → operator.close() → signals
```

The host stops Grok before it closes the socket. This order lets it send `session.ended`.

The host uses a hard deadline of approximately five seconds. It then sends `SIGKILL` to the process group.

`SIGTERM` alone can leave child processes alive.

| Scope   | Examples                                                                         |
| ------- | -------------------------------------------------------------------------------- |
| Process | PartySocket, signal handlers, engine probe, identity                             |
| Session | Child process, ACP transport, `SessionActor`, and local file system bound to cwd |

There is no request scope. A frame is not an HTTP request.

Use one router and one actor mailbox. Do not add middleware for each frame.

## 12. PartySocket adapter

PartySocket stays in infrastructure. Node does not have a global `WebSocket`, so the adapter injects `ws`.

```ts
this.socket = new PartySocket({
  host: cfg.host,
  party: 'hosts',
  room: cfg.hostId.toString(),
  query: async () => ({
    token: cfg.token,
    hostId: cfg.hostId.toString(),
    role: 'host',
  }),
  protocol: 'porte.control.v1',
  WebSocket: WS,
  startClosed: true,
  minReconnectionDelay: 1000,
  maxReconnectionDelay: 30_000,
  reconnectionDelayGrowFactor: 1.3,
  minUptime: 5_000,
  connectionTimeout: 4_000,
  maxRetries: Infinity,
  maxEnqueuedMessages: 256,
})
```

| Choice                              | Reason                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `party: "hosts"` and `room: hostId` | The server addresses one machine instead of a global bus.             |
| Asynchronous token query            | The adapter can read a new token during each reconnect.               |
| `startClosed: true`                 | The composition root creates the adapter, and the lifespan starts it. |
| `maxEnqueuedMessages: 256`          | A long disconnect cannot replay an unlimited queue.                   |
| No offline queue for commands       | `send()` does not prove that the server applied the command.          |

Events use a state snapshot and a ring buffer. They do not use a complete transcript queue.

`hostId` is stable. `connectionId` belongs to one socket.

The server closes the old socket with code `4002` when two sockets use the same `hostId`.

Authentication uses a header or a query token. The host never writes the token to logs.

Authentication failures must not reconnect because unlimited retries can cause account blocking.

## 13. WebSocket errors

PartySocket reconnects, buffers `send()`, and emits `close` after each disconnect. The adapter maps transport events to `OperatorPort` events.

```text
PartySocket open     → { type: "up", generation, connectionId }
PartySocket error    → log only, unless already fatal
PartySocket close    → { type: "down", retrying, code, reason }
send failure         → SendError
```

### Open and close

An `error` event is not terminal. DNS failures, timeouts, and code `1006` reconnect.

Authentication failure is terminal.

```ts
private onClose(ev: CloseEvent) {
  if (this.isFatal(ev.code)) {
    this.stopped = true
    this.socket.close(ev.code, ev.reason)
    this.connCb({ type: "down", retrying: false, code: ev.code, reason: ev.reason })
    return
  }
  this.connCb({ type: "down", retrying: !this.stopped, code: ev.code, reason: ev.reason })
}
```

Use 4xxx codes for business meaning. Do not assign business meaning to code `1000`.

| Code         | Meaning                               | Retry                                     |
| ------------ | ------------------------------------- | ----------------------------------------- |
| 1000 or 1001 | Normal closure or endpoint going away | Yes, when the host did not call `close()` |
| 1006         | Abnormal closure                      | Yes                                       |
| 1013         | Try again later                       | Yes, with more delay                      |
| **4001**     | Bad token                             | **No. Exit with code 1.**                 |
| **4002**     | Host replaced                         | **No. Exit with code 0.**                 |
| **4003**     | Bad protocol                          | **No. Exit with code 1.**                 |
| **4008**     | Rate limit                            | Yes, with more delay                      |

### Send

```ts
async send(msg: OutboundMessage) {
  if (this.stopped) throw new SendError("host_stopped")
  const bytes = this.codec.encode(msg)

  if (msg.kind === "command" && this.socket.readyState !== WebSocket.OPEN) {
    throw new SendError("not_open")
  }
  if (this.socket.bufferedAmount > this.highWater) {
    if (msg.kind === "event" && msg.type !== "session.permission.requested") return
    throw new SendError("backpressured")
  }
  this.socket.send(bytes)
}
```

- A command during a disconnect returns a nack or waits for one connection generation.
- An event during a disconnect enters a ring buffer.
- A reconnect flushes a snapshot, not the raw queue.
- `permission.requested` retries until `permissionTimeout` and then cancels the ACP RPC.

Each open event sends `host.register`, `host.ready`, and `session.snapshot[]`. An operator disconnect does not stop Grok.

### Close

A `close` event occurs for short and terminal disconnects. The host must not stop sessions for `down { retrying: true }`.

```ts
async close() {
  this.stopped = true
  this.socket.close(1000, "host-stop")
  // Wait for the close event with a one-second limit.
}
```

The process calls `.close()` before exit. This action prevents the next process from racing an old socket.

### Error matrix

| Moment                     | Symptom                    | Adapter action              | HostRuntime action              |
| -------------------------- | -------------------------- | --------------------------- | ------------------------------- |
| Open, network              | `error`, then `close` 1006 | Retry                       | Set `Reconnecting`              |
| Open, bad token            | `close` 4001               | Stop retry                  | Stop with `auth` and exit 1     |
| Open, replaced             | `close` 4002               | Stop retry                  | Stop with `replaced` and exit 0 |
| Send, disconnected event   | No open socket             | Add to ring                 | None                            |
| Send, disconnected command | No open socket             | Throw `not_open`            | Return nack or wait             |
| Send, large buffer         | High buffered amount       | Drop events                 | Record metrics                  |
| Send, permission           | Permission event           | Never drop                  | Retry or cancel after timeout   |
| Close, short disconnect    | Close, then open           | Emit retrying down, then up | Register again                  |
| Close, host stopped        | Code 1000 after `.close()` | Ignore                      | Already stopping                |
| Error without close        | Error event only           | Log                         | Do not change status            |

## 14. Heartbeat

The design uses two heartbeat layers.

| Layer                       | Purpose                                       | Reason                                                                   |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| WebSocket ping and pong     | Detect a half-open network connection         | NAT and load balancers can remove idle connections.                      |
| `host.ping` and `host.pong` | Confirm that the application runtime responds | A WebSocket implementation can answer while application work is blocked. |

Two missed application pongs close the socket and start a reconnect. After `porte run`, heartbeat is the only traffic.

## 15. Object lifetimes

| Object                       | `porte run`                         | Prompt                                        |
| ---------------------------- | ----------------------------------- | --------------------------------------------- |
| `main` and `CompositionRoot` | Run                                 | Already ran                                   |
| `HostRuntime`                | `Created` to `Connecting` to `Idle` | Already `Running`                             |
| `PartySocketOperatorChannel` | Connect and register                | Receive and send messages                     |
| `EngineProbe`                | Run `--version`                     | Unused                                        |
| `FrameRouter`                | Route pings                         | Route `session.prompt`                        |
| `SessionSupervisor`          | Contains an empty map               | Finds `actors.get("ses_1")`                   |
| `SessionActor`               | Does not exist                      | Serializes work through its mailbox           |
| `Session`                    | Does not exist                      | `Ready` to `Prompting` to `Ready`             |
| `AgentPort` and ACP          | Do not exist                        | Run `generate()` and receive `session/update` |
| Agent child                  | Does not run                        | Already runs from `session.start`             |

These rules keep both lifecycles separate:

1. A prompt frame cannot create a session.
2. `porte run` cannot create a conversation.
3. An operator disconnect cannot stop an agent.
4. `SessionActor` cannot branch on `engine === "codex"`.
5. ACP types cannot enter the domain.

## 16. Shutdown

```text
SIGINT, standard input EOF, or host.shutdown
  → status = Stopping
  → each actor cancels its active turn
  → answer a pending permission as Cancelled
  → send session/cancel
  → terminate the process group with SIGTERM
  → send SIGKILL after five seconds
  → send session.ended
  → socket.close(1000, "host-stop")
  → exit 0
```

## 17. Testing seams

| Layer          | Test method                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| Domain         | Pure unit tests for `Session` transitions                                            |
| Application    | `SessionActor` with fake `AgentPort` and `OperatorPort` values                       |
| Infrastructure | Contract tests with real `grok acp` input and output, plus a fake PartySocket server |
| Entrypoint     | Smoke test where `porte run` reaches Idle with a mock operator                       |

A test for duplicate turn prevention must not create a PartySocket. If it does, the boundary has leaked.

## 18. Prohibited designs

1. Do not expose ACP over WebSocket as the public API. The server would become another ACP client.
2. Do not create the agent in `main`. The process lifetime belongs to the session.
3. Do not stop Grok when the WebSocket disconnects. The conversation is the expensive state.
4. Do not share mutable `Session` state across WebSocket and ACP callbacks. Use a mailbox.
5. Do not put SDK types in the domain. Domain events must survive an ACP replacement.
6. Do not trust the PartySocket send buffer for commands. Register after each open and use application acknowledgements.
7. Do not reconnect after code `4001`. Repeated bad tokens can cause account blocking.
8. Do not start a session from the first prompt. A missing session returns a nack.

## 19. Implementation order

1. Add the envelope, `WireCodec`, Idle `HostRuntime`, and PartySocket for `porte run`.
2. Add registration, ready state, ping, shutdown, and reconnect behavior.
3. Add the `Session` aggregate and actor mailbox with a fake `AgentPort`.
4. Add `session.start`, `ProcessAgentFactory`, and the Grok ACP adapter.
5. Add prompt streaming and the permission response flow.
6. Add the Claude and Codex engine registry entries.
7. Add reconnect snapshots, backpressure, and process group termination.
