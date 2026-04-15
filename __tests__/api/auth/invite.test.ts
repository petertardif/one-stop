jest.mock('@/lib/tokens', () => ({ createInviteToken: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendInviteEmail: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))

import { POST } from '@/app/api/auth/invite/route'
import { createInviteToken } from '@/lib/tokens'
import { sendInviteEmail } from '@/lib/email'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

const mockGetSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockCreate = createInviteToken as jest.MockedFunction<typeof createInviteToken>
const mockSend = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const adminSession = { user: { id: 'admin-1', email: 'peter.tardif@gmail.com', role: 'admin' as const } }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
})

describe('POST /api/auth/invite', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 401 when authenticated as spouse', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'u1', email: 'spouse@b.com', role: 'partner' },
    } as never)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns invite URL on valid admin request without emailHint', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockCreate.mockResolvedValueOnce('generated-token-64chars00000000000000000000000000000000000000000000')

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.inviteUrl).toContain('/register?token=')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends invite email when emailHint is provided', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockCreate.mockResolvedValueOnce('generated-token-64chars00000000000000000000000000000000000000000000')
    mockSend.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest({ emailHint: 'spouse@example.com' }))

    expect(res.status).toBe(201)
    expect(mockSend).toHaveBeenCalledWith('spouse@example.com', expect.any(String))
  })

  it('still returns 201 if sending email throws (non-fatal)', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)
    mockCreate.mockResolvedValueOnce('token-abc')
    mockSend.mockRejectedValueOnce(new Error('SMTP down'))

    const res = await POST(makeRequest({ emailHint: 'spouse@example.com' }))
    expect(res.status).toBe(201)
  })

  it('returns 400 for invalid emailHint format', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession as never)

    const res = await POST(makeRequest({ emailHint: 'not-an-email' }))
    expect(res.status).toBe(400)
  })
})
