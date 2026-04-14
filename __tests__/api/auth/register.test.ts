jest.mock('@/lib/db', () => ({ query: jest.fn() }))
jest.mock('@/lib/tokens', () => ({
  validateInviteToken: jest.fn(),
  consumeInviteToken: jest.fn(),
}))
jest.mock('bcryptjs', () => ({ hash: jest.fn() }))

import { POST } from '@/app/api/auth/register/route'
import { query } from '@/lib/db'
import { validateInviteToken, consumeInviteToken } from '@/lib/tokens'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'

const mockQuery = query as jest.MockedFunction<typeof query>
const mockValidate = validateInviteToken as jest.MockedFunction<typeof validateInviteToken>
const mockConsume = consumeInviteToken as jest.MockedFunction<typeof consumeInviteToken>
const mockHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validToken = { id: 't1', token: 'abc', invited_by: 'admin', role: 'spouse' as const, email_hint: null, used_at: null, expires_at: new Date() }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/auth/register', () => {
  it('returns 400 for missing fields', async () => {
    const res = await POST(makeRequest({ token: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await POST(makeRequest({ token: 'abc', email: 'a@b.com', password: 'short' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid or expired invite token', async () => {
    mockValidate.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ token: 'bad', email: 'a@b.com', password: 'password123' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid or expired/i)
  })

  it('returns 409 when email is already registered', async () => {
    mockValidate.mockResolvedValueOnce(validToken)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 } as never)

    const res = await POST(makeRequest({ token: 'abc', email: 'taken@b.com', password: 'password123' }))
    expect(res.status).toBe(409)
  })

  it('creates user and consumes token on valid request', async () => {
    mockValidate.mockResolvedValueOnce(validToken)
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // email check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // insert user
    mockHash.mockResolvedValueOnce('hashed-pw' as never)
    mockConsume.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest({ token: 'abc', email: 'new@b.com', password: 'password123' }))

    expect(res.status).toBe(201)
    expect(mockHash).toHaveBeenCalledWith('password123', 12)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['new@b.com', 'hashed-pw', 'spouse'])
    )
    expect(mockConsume).toHaveBeenCalledWith('abc')
  })

  it('lowercases the email on insert', async () => {
    mockValidate.mockResolvedValueOnce(validToken)
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
    mockHash.mockResolvedValueOnce('hashed-pw' as never)
    mockConsume.mockResolvedValueOnce(undefined)

    await POST(makeRequest({ token: 'abc', email: 'New@B.COM', password: 'password123' }))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['new@b.com'])
    )
  })
})
