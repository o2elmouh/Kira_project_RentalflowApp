import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase — chainable query builder.
vi.mock('../supabaseAdmin.js', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

// Mock Baileys — sessionManager imports `makeWASocket` as the default export
// AND named exports (DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage).
const mockSock = {
  ev: { on: vi.fn() },
  user: { id: '212600000001:1@s.whatsapp.net' },
  sendMessage: vi.fn().mockResolvedValue({}),
  logout: vi.fn().mockResolvedValue({}),
  end: vi.fn(),
  updateMediaMessage: vi.fn(),
}
const makeWASocketMock = vi.fn(() => mockSock)
vi.mock('@whiskeysockets/baileys', () => ({
  default: makeWASocketMock,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3, 0] }),
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('img')),
}))

vi.mock('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    constructor(msg, opts) { super(msg); this.output = { statusCode: opts?.statusCode || 500 } }
  },
}))

vi.mock('./authState.js', () => ({
  useSupabaseAuthState: vi.fn().mockResolvedValue({
    state:     { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
}))

vi.mock('../../routes/leads.js', () => ({
  handleInboundWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,abc') },
}))

vi.mock('pino', () => ({ default: vi.fn(() => ({ level: 'silent', child: vi.fn() })) }))

describe('sessionManager', () => {
  let sessionManager

  beforeEach(async () => {
    vi.resetModules()
    makeWASocketMock.mockClear()
    sessionManager = await import('./sessionManager.js')
  })

  it('getStatus returns idle for unknown agency', () => {
    const result = sessionManager.getStatus('unknown-agency')
    expect(result).toMatchObject({
      connected: false, qrDataUrl: null, status: 'idle', phone: null,
      connectedAt: null, dailySendCount: 0,
    })
    expect(typeof result.dailySendLimit).toBe('number')
  })

  it('startSession is idempotent — second call while connecting is a no-op', async () => {
    await sessionManager.startSession('agency-1')
    await sessionManager.startSession('agency-1') // second call
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })

  it('sendMessage throws when no active session', async () => {
    await expect(
      sessionManager.sendMessage('no-session-agency', '212600000001@s.whatsapp.net', 'hello')
    ).rejects.toThrow('No active WhatsApp session')
  })

  it('initAllSessions starts sessions for all DB rows', async () => {
    const supabaseAdmin = (await import('../supabaseAdmin.js')).default
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data:  [{ agency_id: 'a1' }, { agency_id: 'a2' }],
        error: null,
      }),
    })
    await sessionManager.initAllSessions()
    // initAllSessions fires startSession(...) without awaiting (parallel),
    // so we need to flush the microtask queue before checking the mock.
    await new Promise(resolve => setImmediate(resolve))
    expect(makeWASocketMock).toHaveBeenCalledTimes(2)
  })

  it('reapOrphanedSessions disconnects sessions for agencies that no longer exist', async () => {
    const supabaseAdmin = (await import('../supabaseAdmin.js')).default

    // First call (during startSession): maybeSingle for auth_state lookup
    // Second call (during reaper): agencies .select('id').in('id', [...])
    // Third call (during disconnectSession): delete on whatsapp_sessions
    let callIdx = 0
    supabaseAdmin.from.mockImplementation((table) => {
      callIdx++
      if (table === 'agencies') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ id: 'live-agency' }], error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    // Seed two in-memory sessions
    await sessionManager.startSession('live-agency')
    await sessionManager.startSession('dead-agency')
    await new Promise(resolve => setImmediate(resolve))

    await sessionManager.reapOrphanedSessions()

    // dead-agency should be gone; live-agency remains
    expect(sessionManager.getStatus('dead-agency').status).toBe('idle')
    expect(sessionManager.getStatus('live-agency').status).not.toBe('idle')
  })

  it('parsePhoneFromJid handles device-suffixed and bad JIDs', () => {
    const { parsePhoneFromJid } = sessionManager
    expect(parsePhoneFromJid('212600000001:42@s.whatsapp.net')).toBe('212600000001')
    expect(parsePhoneFromJid('212600000001@s.whatsapp.net')).toBe('212600000001')
    expect(parsePhoneFromJid('abc@lid')).toBe(null)
    expect(parsePhoneFromJid(null)).toBe(null)
    expect(parsePhoneFromJid('')).toBe(null)
  })
})
