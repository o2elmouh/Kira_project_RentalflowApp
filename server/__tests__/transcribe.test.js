import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture the OpenAI client mock so we can assert what was sent.
const createMock = vi.fn()
const toFileMock = vi.fn(async (buf, name, opts) => ({ name, type: opts?.type, _buf: buf }))

vi.mock('openai', () => {
  const OpenAI = vi.fn(function () {
    this.audio = { transcriptions: { create: createMock } }
  })
  OpenAI.toFile = toFileMock
  return { default: OpenAI }
})

const ORIGINAL_KEY = process.env.OPENAI_API_KEY

async function freshImport() {
  vi.resetModules()
  return await import('../lib/transcribe.js')
}

describe('transcribeAudio', () => {
  beforeEach(() => {
    createMock.mockReset()
    toFileMock.mockClear()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY
  })

  it('returns null when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY
    const { transcribeAudio } = await freshImport()
    const result = await transcribeAudio(Buffer.from('fake-audio'), 'audio/ogg')
    expect(result).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null for empty/null buffers without calling the API', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { transcribeAudio } = await freshImport()
    expect(await transcribeAudio(null, 'audio/ogg')).toBeNull()
    expect(await transcribeAudio(Buffer.alloc(0), 'audio/ogg')).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns the transcribed text on success', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    createMock.mockResolvedValueOnce({ text: 'Bonjour, je veux louer une voiture' })
    const { transcribeAudio } = await freshImport()
    const buf = Buffer.from('audio-bytes')
    const result = await transcribeAudio(buf, 'audio/ogg; codecs=opus')
    expect(result).toBe('Bonjour, je veux louer une voiture')
    expect(createMock).toHaveBeenCalledOnce()
    expect(toFileMock).toHaveBeenCalledWith(buf, 'voice.ogg', { type: 'audio/ogg; codecs=opus' })
  })

  it('returns null when Whisper returns empty text', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    createMock.mockResolvedValueOnce({ text: '   ' })
    const { transcribeAudio } = await freshImport()
    const result = await transcribeAudio(Buffer.from('x'), 'audio/ogg')
    expect(result).toBeNull()
  })

  it('returns null and swallows errors when Whisper throws', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    createMock.mockRejectedValueOnce(new Error('Network down'))
    const { transcribeAudio } = await freshImport()
    const result = await transcribeAudio(Buffer.from('x'), 'audio/ogg')
    expect(result).toBeNull()
  })

  it('maps mp4 mime to .m4a extension', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    createMock.mockResolvedValueOnce({ text: 'hello' })
    const { transcribeAudio } = await freshImport()
    await transcribeAudio(Buffer.from('x'), 'audio/mp4')
    expect(toFileMock).toHaveBeenCalledWith(expect.any(Buffer), 'voice.m4a', { type: 'audio/mp4' })
  })
})
