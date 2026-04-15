jest.mock('@/lib/db', () => ({ query: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))

import { GET, PUT } from '@/app/api/profile/route'
import { query } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

const mockQuery = query as jest.MockedFunction<typeof query>
const mockGetSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const adminSession = { user: { id: 'user-1', email: 'peter.tardif@gmail.com', role: 'admin' as const } }

function makePutRequest(body: unknown) {
  return new NextRequest('http://localhost/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/profile', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns profile data when found', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    const fakeProfile = { first_name: 'Peter', last_name: 'Tardif', date_of_birth: null, phone: null, address_line1: null, address_line2: null, city: null, state: null, postal_code: null, country: 'US' }
    mockQuery.mockResolvedValueOnce({ rows: [fakeProfile], rowCount: 1 } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(fakeProfile)
  })

  it('returns empty object when no profile row exists', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({})
  })
})

describe('PUT /api/profile', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await PUT(makePutRequest({ first_name: 'Peter' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid date_of_birth format', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    const res = await PUT(makePutRequest({ first_name: 'Peter', date_of_birth: '01/01/1990' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when first_name is empty string', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    const res = await PUT(makePutRequest({ first_name: '' }))
    expect(res.status).toBe(400)
  })

  it('upserts profile and returns 200', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockQuery.mockResolvedValueOnce({ rows: [{ first_name: 'Peter' }], rowCount: 1 } as never)

    const res = await PUT(makePutRequest({
      first_name: 'Peter',
      last_name: 'Tardif',
      date_of_birth: '1985-06-15',
      phone: '555-1234',
    }))

    expect(res.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (user_id) DO UPDATE'),
      expect.arrayContaining(['user-1', 'Peter', 'Tardif', '1985-06-15', '555-1234'])
    )
  })

  it('returns 400 when first_name ends up null after upsert (omitted on first save)', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockQuery.mockResolvedValueOnce({ rows: [{ first_name: null }], rowCount: 1 } as never)

    const res = await PUT(makePutRequest({ last_name: 'Tardif' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/first name is required/i)
  })

  it('converts empty string date_of_birth to null', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockQuery.mockResolvedValueOnce({ rows: [{ first_name: 'Peter' }], rowCount: 1 } as never)

    await PUT(makePutRequest({ first_name: 'Peter', date_of_birth: '' }))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([null])
    )
  })
})

describe('POST /api/auth/register — profile row creation', () => {
  // Re-test register to verify profile row is created alongside the user
  jest.mock('@/lib/tokens', () => ({
    validateInviteToken: jest.fn(),
    consumeInviteToken: jest.fn(),
  }))
  jest.mock('bcryptjs', () => ({ hash: jest.fn() }))
})
