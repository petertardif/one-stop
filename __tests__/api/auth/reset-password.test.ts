jest.mock('@/lib/db', () => ({ query: jest.fn() }))
jest.mock('@/lib/tokens', () => ({
  validatePasswordResetToken: jest.fn(),
  consumePasswordResetToken: jest.fn(),
}))
jest.mock('bcryptjs', () => ({ hash: jest.fn() }))

import { POST } from '@/app/api/auth/reset-password/route'
import { query } from '@/lib/db'
import { validatePasswordResetToken, consumePasswordResetToken } from '@/lib/tokens'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'

const mockQuery = query as jest.MockedFunction<typeof query>
const mockValidate = validatePasswordResetToken as jest.MockedFunction<typeof validatePasswordResetToken>
const mockConsume = consumePasswordResetToken as jest.MockedFunction<typeof consumePasswordResetToken>
const mockHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validTokenRow = { id: 'rt-1', token: 'tok', user_id: 'user-1', used_at: null, expires_at: new Date() }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/auth/reset-password', () => {
  it('returns 400 for missing token', async () => {
    const res = await POST(makeRequest({ password: 'newpassword1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await POST(makeRequest({ token: 'tok', password: 'short' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid or expired token', async () => {
    mockValidate.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ token: 'expired', password: 'newpassword1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid or expired/i)
  })

  it('updates password and consumes token on valid request', async () => {
    mockValidate.mockResolvedValueOnce(validTokenRow)
    mockHash.mockResolvedValueOnce('new-hash' as never)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
    mockConsume.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest({ token: 'tok', password: 'newpassword1' }))

    expect(res.status).toBe(200)
    expect(mockHash).toHaveBeenCalledWith('newpassword1', 12)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['new-hash', 'user-1']
    )
    expect(mockConsume).toHaveBeenCalledWith('tok')
  })

  it('does not update password if token is already used', async () => {
    mockValidate.mockResolvedValueOnce(null) // used token returns null

    const res = await POST(makeRequest({ token: 'used-tok', password: 'newpassword1' }))

    expect(res.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
