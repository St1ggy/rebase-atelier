import type { PlanRow } from '../domain/types'

type DemoFile = { path: string; before: string[]; after: string[] }

function lines(text: string): string[] {
  return text.trim().split('\n')
}

function added(path: string, text: string): DemoFile {
  return { path, before: [], after: lines(text) }
}

const authentication = added(
  'src/auth.ts',
  `
import { timingSafeEqual } from 'node:crypto'
import { SessionStore } from './session-store'

export type Credentials = {
  authorization?: string
  requestId: string
}

export type Identity = {
  userId: string
  roles: string[]
  expiresAt: number
}

export class AuthenticationError extends Error {
  constructor(public readonly code: string) {
    super('Your session has expired')
  }
}

export function readBearerToken(credentials: Credentials): string {
  const header = credentials.authorization
  if (!header) throw new AuthenticationError('missing-token')
  const [scheme, token] = header.split(' ', 2)
  if (scheme !== 'Bearer' || !token) {
    throw new AuthenticationError('invalid-scheme')
  }
  return token
}

export async function authenticate(request, sessions: SessionStore) {
  const token = readBearerToken(request.headers)
  const identity = await verifyToken(token, sessions)
  if (identity.expiresAt <= Date.now()) {
    throw new AuthenticationError('expired-token')
  }
  return identity
}

export async function verifyToken(token: string, sessions: SessionStore) {
  const session = await sessions.find(token)
  if (!session) throw new AuthenticationError('unknown-token')
  const actual = Buffer.from(token)
  const expected = Buffer.from(session.token)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuthenticationError('invalid-signature')
  }
  return session.identity
}
`,
)

const sessions = added(
  'src/session-store.ts',
  `
import type { Identity } from './auth'

export type Session = {
  token: string
  identity: Identity
  createdAt: number
  lastSeenAt: number
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>()

  async find(token: string): Promise<Session | undefined> {
    const session = this.sessions.get(token)
    if (!session) return undefined
    if (session.identity.expiresAt <= Date.now()) {
      this.sessions.delete(token)
      return undefined
    }
    session.lastSeenAt = Date.now()
    return session
  }

  async create(token: string, identity: Identity): Promise<void> {
    const now = Date.now()
    this.sessions.set(token, {
      token,
      identity,
      createdAt: now,
      lastSeenAt: now,
    })
  }

  async revoke(token: string): Promise<boolean> {
    return this.sessions.delete(token)
  }

  async revokeUser(userId: string): Promise<number> {
    let revoked = 0
    for (const [token, session] of this.sessions) {
      if (session.identity.userId === userId) {
        this.sessions.delete(token)
        revoked += 1
      }
    }
    return revoked
  }

  async prune(): Promise<number> {
    const now = Date.now()
    let removed = 0
    for (const [token, session] of this.sessions) {
      if (session.identity.expiresAt <= now) {
        this.sessions.delete(token)
        removed += 1
      }
    }
    return removed
  }
}
`,
)

const middleware = added(
  'src/http/auth-middleware.ts',
  `
import { authenticate, AuthenticationError } from '../auth'
import { SessionStore } from '../session-store'

export function withAuthentication(handler, sessions: SessionStore) {
  return async function authenticatedRequest(request) {
    try {
      const identity = await authenticate(request, sessions)
      return await handler({ ...request, identity })
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return new Response(JSON.stringify({
          code: error.code,
          message: error.message,
          requestId: request.requestId,
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw error
    }
  }
}

export function requireRole(role: string, handler) {
  return async function authorizedRequest(request) {
    if (!request.identity.roles.includes(role)) {
      return new Response('Forbidden', { status: 403 })
    }
    return handler(request)
  }
}
`,
)

const scenarios = [
  ['missing credentials', '', 'missing-token'],
  ['unsupported scheme', 'Basic token', 'invalid-scheme'],
  ['empty bearer token', 'Bearer ', 'invalid-scheme'],
  ['unknown session', 'Bearer unknown', 'unknown-token'],
  ['revoked session', 'Bearer revoked', 'unknown-token'],
  ['expired session', 'Bearer expired', 'expired-token'],
  ['malformed signature', 'Bearer malformed', 'invalid-signature'],
] as const

const tests = added(
  'tests/auth.test.ts',
  [
    "import { expect, test } from 'bun:test'",
    "import { authenticate } from '../src/auth'",
    "import { SessionStore } from '../src/session-store'",
    '',
    ...scenarios.flatMap(([name, header, code]) => [
      `test('rejects ${name}', async () => {`,
      '  const sessions = new SessionStore()',
      `  const request = fixture({ authorization: '${header}' })`,
      `  await expect(authenticate(request, sessions)).rejects.toMatchObject({`,
      `    code: '${code}',`,
      '  })',
      '})',
      '',
    ]),
    "test('returns the identity of an active session', async () => {",
    '  const sessions = new SessionStore()',
    "  await sessions.create('valid', identityFixture())",
    "  const identity = await authenticate(fixture({ authorization: 'Bearer valid' }), sessions)",
    "  expect(identity.userId).toBe('user-42')",
    '})',
  ].join('\n'),
)

const patches: Record<string, DemoFile[]> = {
  a4c92e1: [
    authentication,
    sessions,
    middleware,
    added(
      'config/auth.example.json',
      `
{
  "sessionTtlSeconds": 3600,
  "idleTimeoutSeconds": 900,
  "authorizationScheme": "Bearer",
  "roles": ["reader", "writer", "administrator"]
}`,
    ),
  ],
  '91de703': [
    { path: 'src/auth.ts', before: ['  return token.length > 0'], after: ['  return validateSignature(token)'] },
  ],
  c863b25: [
    tests,
    added(
      'tests/fixtures/auth.ts',
      `
export function identityFixture() {
  return {
    userId: 'user-42',
    roles: ['reader', 'writer'],
    expiresAt: Date.now() + 60_000,
  }
}

export function fixture(headers) {
  return {
    headers,
    requestId: 'request-7',
    method: 'GET',
    path: '/account',
  }
}`,
    ),
    added(
      'tests/session-store.test.ts',
      `
import { expect, test } from 'bun:test'
import { SessionStore } from '../src/session-store'

test('revokes all sessions belonging to a user', async () => {
  const store = new SessionStore()
  await store.create('first', identityFixture())
  await store.create('second', identityFixture())
  expect(await store.revokeUser('user-42')).toBe(2)
  expect(await store.find('first')).toBeUndefined()
})

test('prunes expired sessions', async () => {
  const store = new SessionStore()
  await store.create('expired', { ...identityFixture(), expiresAt: 0 })
  expect(await store.prune()).toBe(1)
})
`,
    ),
  ],
  '74f081a': [
    {
      path: 'src/errors.ts',
      before: ['  throw new Error("Unauthorized")'],
      after: ['  throw new AuthError("Your session has expired")'],
    },
  ],
  '52ac984': [
    middleware,
    {
      path: 'src/router.ts',
      before: ["router.get('/account', accountHandler)", "router.post('/documents', documentHandler)"],
      after: [
        "import { withAuthentication, requireRole } from './http/auth-middleware'",
        '',
        "router.get('/account', withAuthentication(accountHandler, sessions))",
        "router.post('/documents', withAuthentication(",
        "  requireRole('writer', documentHandler),",
        '  sessions,',
        '))',
      ],
    },
    added(
      'src/http/request-context.ts',
      `
import type { Identity } from '../auth'

export type RequestContext = {
  requestId: string
  method: string
  path: string
  headers: Record<string, string>
}

export type AuthenticatedRequest = RequestContext & {
  identity: Identity
}
`,
    ),
  ],
  '09de662': [
    {
      path: 'src/auth.ts',
      before: ['  return verifyToken(token)'],
      after: ['  console.debug("temporary auth trace")', '  return verifyToken(token)'],
    },
  ],
}

function filePatch(file: DemoFile): string {
  const oldStart = file.before.length > 0 ? 1 : 0
  const removed = file.before.map((line) => `-${line}`)
  const inserted = file.after.map((line) => `+${line}`)
  const beforePath = file.before.length > 0 ? `a/${file.path}` : '/dev/null'

  return [
    `diff --git a/${file.path} b/${file.path}`,
    `--- ${beforePath}`,
    `+++ b/${file.path}`,
    `@@ -${oldStart},${file.before.length} +1,${file.after.length} @@`,
    ...removed,
    ...inserted,
  ].join('\n')
}

export function demoDetails(row: PlanRow): string {
  const files = patches[row.revision]

  if (!files) return 'No example patch for this change.'

  const additions = files.reduce((total, file) => total + file.after.length, 0)
  const deletions = files.reduce((total, file) => total + file.before.length, 0)
  const summary = files
    .map((file) => ` ${file.path.padEnd(34)} +${file.after.length} -${file.before.length}`)
    .join('\n')

  return `Example patch · demo data\n${files.length} files changed · +${additions} -${deletions}\n\n${summary}\n\n${files.map((file) => filePatch(file)).join('\n\n')}`
}
