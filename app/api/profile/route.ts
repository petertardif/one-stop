import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

interface ProfileRow {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
}

const updateSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100).optional(),
  last_name: z.string().max(100).optional(),
  date_of_birth: z.string().transform(v => v === '' ? null : v).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable()).optional(),
  phone: z.string().max(30).optional().nullable(),
  address_line1: z.string().max(200).optional().nullable(),
  address_line2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query<ProfileRow>(
    `SELECT first_name, last_name, date_of_birth, phone,
            address_line1, address_line2, city, state, postal_code, country
     FROM user_profiles WHERE user_id = $1`,
    [session.user.id]
  )

  return NextResponse.json(result.rows[0] ?? {})
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const {
    first_name, last_name, date_of_birth, phone,
    address_line1, address_line2, city, state, postal_code, country,
  } = parsed.data

  const result = await query<{ first_name: string | null }>(
    `INSERT INTO user_profiles
       (user_id, first_name, last_name, date_of_birth, phone,
        address_line1, address_line2, city, state, postal_code, country)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET
       first_name    = COALESCE(EXCLUDED.first_name,    user_profiles.first_name),
       last_name     = COALESCE(EXCLUDED.last_name,     user_profiles.last_name),
       date_of_birth = COALESCE(EXCLUDED.date_of_birth, user_profiles.date_of_birth),
       phone         = EXCLUDED.phone,
       address_line1 = EXCLUDED.address_line1,
       address_line2 = EXCLUDED.address_line2,
       city          = EXCLUDED.city,
       state         = EXCLUDED.state,
       postal_code   = EXCLUDED.postal_code,
       country       = COALESCE(EXCLUDED.country, user_profiles.country)
     RETURNING first_name`,
    [
      session.user.id,
      first_name ?? null, last_name ?? null, date_of_birth ?? null, phone ?? null,
      address_line1 ?? null, address_line2 ?? null, city ?? null,
      state ?? null, postal_code ?? null, country ?? 'US',
    ]
  )

  if (!result.rows[0]?.first_name) {
    return NextResponse.json({ error: 'First name is required' }, { status: 400 })
  }

  return NextResponse.json({ message: 'Profile updated' })
}
