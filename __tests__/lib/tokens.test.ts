import { generateSecureToken } from '@/lib/tokens'

// Mock the db module so token functions don't need a real database
jest.mock('@/lib/db', () => ({
  query: jest.fn(),
}))

import { query } from '@/lib/db'
import {
  createInviteToken,
  validateInviteToken,
  consumeInviteToken,
  createPasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
} from '@/lib/tokens'

const mockQuery = query as jest.MockedFunction<typeof query>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('generateSecureToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateSecureToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateSecureToken()))
    expect(tokens.size).toBe(20)
  })
})

describe('createInviteToken', () => {
  it('inserts a token row and returns the token string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)

    const token = await createInviteToken('user-id-123', 'spouse', 'test@example.com')

    expect(token).toHaveLength(64)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO invite_tokens'),
      expect.arrayContaining(['user-id-123', 'spouse', 'test@example.com'])
    )
  })

  it('passes null email_hint when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)

    await createInviteToken('user-id-123', 'spouse')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([null])
    )
  })
})

describe('validateInviteToken', () => {
  it('returns the token row when valid', async () => {
    const fakeRow = { id: 'tok-1', token: 'abc', invited_by: 'u1', role: 'spouse', email_hint: null, used_at: null, expires_at: new Date() }
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 } as never)

    const result = await validateInviteToken('abc')
    expect(result).toEqual(fakeRow)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('used_at IS NULL'),
      ['abc']
    )
  })

  it('returns null when no matching token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    const result = await validateInviteToken('bad-token')
    expect(result).toBeNull()
  })
})

describe('consumeInviteToken', () => {
  it('sets used_at on the token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)

    await consumeInviteToken('abc')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('used_at = NOW()'),
      ['abc']
    )
  })
})

describe('createPasswordResetToken', () => {
  it('invalidates existing tokens then inserts a new one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // invalidate
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // insert

    const token = await createPasswordResetToken('user-id-456')

    expect(token).toHaveLength(64)
    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('used_at = NOW()'),
      ['user-id-456']
    )
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO password_reset_tokens'),
      expect.arrayContaining(['user-id-456'])
    )
  })
})

describe('validatePasswordResetToken', () => {
  it('returns the token row when valid', async () => {
    const fakeRow = { id: 'rt-1', token: 'xyz', user_id: 'u2', used_at: null, expires_at: new Date() }
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 } as never)

    const result = await validatePasswordResetToken('xyz')
    expect(result).toEqual(fakeRow)
  })

  it('returns null when no matching token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    const result = await validatePasswordResetToken('expired')
    expect(result).toBeNull()
  })
})

describe('consumePasswordResetToken', () => {
  it('sets used_at on the token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)

    await consumePasswordResetToken('xyz')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('used_at = NOW()'),
      ['xyz']
    )
  })
})
