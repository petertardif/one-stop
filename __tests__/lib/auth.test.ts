jest.mock('@/lib/db', () => ({ query: jest.fn() }))
jest.mock('bcryptjs', () => ({ compare: jest.fn() }))

import { query } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { authorizeUser, authOptions } from '@/lib/auth'

const mockQuery = query as jest.MockedFunction<typeof query>
const mockCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>

const fakeUser = {
  id: 'user-uuid-1',
  email: 'peter.tardif@gmail.com',
  password_hash: '$2b$12$hashedpassword',
  role: 'admin' as const,
}

beforeEach(() => jest.clearAllMocks())

describe('authorizeUser', () => {
  it('returns null when user is not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    const result = await authorizeUser('nobody@example.com', 'pass')

    expect(result).toBeNull()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['nobody@example.com']
    )
  })

  it('returns null when password does not match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as never)
    mockCompare.mockResolvedValueOnce(false as never)

    const result = await authorizeUser(fakeUser.email, 'wrongpass')
    expect(result).toBeNull()
  })

  it('returns user object on valid credentials', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as never)
    mockCompare.mockResolvedValueOnce(true as never)

    const result = await authorizeUser(fakeUser.email, 'tardif')

    expect(result).toEqual({
      id: fakeUser.id,
      email: fakeUser.email,
      role: fakeUser.role,
    })
  })

  it('lowercases the email before querying', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as never)
    mockCompare.mockResolvedValueOnce(true as never)

    await authorizeUser('Peter.Tardif@Gmail.COM', 'tardif')

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['peter.tardif@gmail.com'])
  })
})

describe('credentials provider authorize wrapper', () => {
  const provider = authOptions.providers[0] as { authorize: Function }

  it('returns null when credentials are missing', async () => {
    const result = await provider.authorize(undefined, {})
    expect(result).toBeNull()
  })

  it('returns null when email is missing', async () => {
    const result = await provider.authorize({ password: 'pass' }, {})
    expect(result).toBeNull()
  })

  it('returns null when password is missing', async () => {
    const result = await provider.authorize({ email: 'a@b.com' }, {})
    expect(result).toBeNull()
  })
})

describe('JWT and session callbacks', () => {
  const jwtCallback = authOptions.callbacks!.jwt!
  const sessionCallback = authOptions.callbacks!.session!

  it('jwt callback copies id and role from user onto token on sign in', async () => {
    const token = { sub: 'sub' } as never
    const user = { id: 'u1', email: 'a@b.com', role: 'admin' as const }
    const result = await jwtCallback({ token, user, account: null, trigger: 'signIn' } as never)
    expect(result).toMatchObject({ id: 'u1', role: 'admin' })
  })

  it('jwt callback returns token unchanged when no user (token refresh)', async () => {
    const token = { id: 'u1', role: 'partner' as const } as never
    const result = await jwtCallback({ token, user: undefined } as never)
    expect(result).toMatchObject({ id: 'u1', role: 'partner' })
  })

  it('session callback copies id and role from token onto session.user', async () => {
    const session = { user: { email: 'a@b.com' }, expires: '' } as never
    const token = { id: 'u1', role: 'admin' as const } as never
    const result = await sessionCallback({ session, token } as never)
    expect(result.user).toMatchObject({ id: 'u1', role: 'admin' })
  })
})
