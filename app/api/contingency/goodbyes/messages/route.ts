import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query, pool } from '@/lib/db'

// Goodbye messages are co-authored by the admin + any partner_admin.
export function isAuthor(role?: string): boolean {
  return role === 'admin' || role === 'partner_admin'
}

const imageSchema = z.object({
  image_url: z.string().min(1),
  caption: z.string().nullable().optional(),
})

export const messageSchema = z
  .object({
    kind: z.enum(['main', 'letter', 'video', 'audio', 'gallery', 'open_when']),
    audience_role: z.enum(['everyone', 'partner', 'dependent', 'partner_admin']).nullable().optional(),
    audience_user_id: z.string().uuid().nullable().optional(),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    media_url: z.string().nullable().optional(),
    release_mode: z.enum(['immediate', 'offset', 'date', 'milestone', 'recurring_annual']),
    offset_amount: z.number().int().positive().nullable().optional(),
    offset_unit: z.enum(['days', 'months', 'years']).nullable().optional(),
    release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    milestone_label: z.string().nullable().optional(),
    images: z.array(imageSchema).optional(),
  })
  .refine((d) => (d.audience_role ? 1 : 0) + (d.audience_user_id ? 1 : 0) === 1, {
    message: 'Provide exactly one of audience_role or audience_user_id',
  })

interface MessageRow {
  id: string
  author_id: string
  kind: string
  audience_role: string | null
  audience_user_id: string | null
  title: string | null
  body: string | null
  media_url: string | null
  release_mode: string
  offset_amount: number | null
  offset_unit: string | null
  release_date: string | null
  milestone_label: string | null
  sort_order: number
}

interface ImageRow {
  id: string
  message_id: string
  image_url: string
  caption: string | null
  sort_order: number
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !isAuthor(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [msgs, imgs] = await Promise.all([
    query<MessageRow>(
      `SELECT id, author_id, kind, audience_role, audience_user_id, title, body, media_url,
              release_mode, offset_amount, offset_unit, to_char(release_date, 'YYYY-MM-DD') AS release_date,
              milestone_label, sort_order
       FROM goodbye_messages
       ORDER BY sort_order, created_at`
    ),
    query<ImageRow>(
      `SELECT id, message_id, image_url, caption, sort_order
       FROM goodbye_gallery_images
       ORDER BY sort_order, created_at`
    ),
  ])

  const byMsg = new Map<string, ImageRow[]>()
  for (const img of imgs.rows) {
    const arr = byMsg.get(img.message_id) ?? []
    arr.push(img)
    byMsg.set(img.message_id, arr)
  }

  return NextResponse.json({
    messages: msgs.rows.map((m) => ({ ...m, images: byMsg.get(m.id) ?? [] })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAuthor(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = messageSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query<{ id: string }>(
      `INSERT INTO goodbye_messages
         (author_id, kind, audience_role, audience_user_id, title, body, media_url,
          release_mode, offset_amount, offset_unit, release_date, milestone_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        session.user.id, d.kind, d.audience_role ?? null, d.audience_user_id ?? null,
        d.title ?? null, d.body ?? null, d.media_url ?? null, d.release_mode,
        d.offset_amount ?? null, d.offset_unit ?? null, d.release_date ?? null, d.milestone_label ?? null,
      ]
    )
    const id = res.rows[0].id
    if (d.images?.length) {
      for (let i = 0; i < d.images.length; i++) {
        await client.query(
          `INSERT INTO goodbye_gallery_images (message_id, image_url, caption, sort_order)
           VALUES ($1,$2,$3,$4)`,
          [id, d.images[i].image_url, d.images[i].caption ?? null, i]
        )
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
