jest.mock('@/lib/db', () => ({ query: jest.fn() }))
jest.mock('@/lib/tokens', () => ({ createPasswordResetToken: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendPasswordResetEmail: jest.fn() }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => true) }))

import { POST } from '@/app/api/auth/forgot-password/route'
import { query } from '@/lib/db'
import { createPasswordResetToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextRequest } from 'next/server'

const mockQuery = query as jest.MockedFunction<typeof query>
const mockCreate = createPasswordResetToken as jest.MockedFunction<typeof createPasswordResetToken>
const mockSend = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>
const mockRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>

function makeRequest(body: unknown, ip = '1.2.3.4') {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRateLimit.mockReturnValue(true)
})

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 regardless of whether email exists (prevents enumeration)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    const res = await POST(makeRequest({ email: 'nobody@example.com' }))
    expect(res.status).toBe(200)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 200 even for invalid email format', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(200)
  })

  it('creates a reset token and sends email when user exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }], rowCount: 1 } as never)
    mockCreate.mockResolvedValueOnce('reset-token-abc')
    mockSend.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest({ email: 'peter.tardif@gmail.com' }))

    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith('user-1')
    expect(mockSend).toHaveBeenCalledWith('peter.tardif@gmail.com', 'reset-token-abc')
  })

  it('still returns 200 if sending the email throws', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }], rowCount: 1 } as never)
    mockCreate.mockResolvedValueOnce('reset-token-abc')
    mockSend.mockRejectedValueOnce(new Error('SMTP error'))

    const res = await POST(makeRequest({ email: 'peter.tardif@gmail.com' }))
    expect(res.status).toBe(200)
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mockRateLimit.mockReturnValue(false)

    const res = await POST(makeRequest({ email: 'peter.tardif@gmail.com' }))
    expect(res.status).toBe(429)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('passes the IP address to the rate limiter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    await POST(makeRequest({ email: 'a@b.com' }, '9.8.7.6'))

    expect(mockRateLimit).toHaveBeenCalledWith(
      'forgot-password:9.8.7.6',
      5,
      15 * 60 * 1000
    )
  })
})
