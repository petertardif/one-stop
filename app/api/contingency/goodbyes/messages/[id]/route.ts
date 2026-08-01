import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query, pool } from '@/lib/db'
import { isAuthor, messageSchema } from '@/lib/goodbyes'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const res = await client.query(
      `UPDATE goodbye_messages SET
         kind = $2, audience_role = $3, audience_user_id = $4, title = $5, body = $6,
         media_url = $7, release_mode = $8, offset_amount = $9, offset_unit = $10,
         release_date = $11, milestone_label = $12, updated_at = NOW()
       WHERE id = $1`,
      [
        params.id, d.kind, d.audience_role ?? null, d.audience_user_id ?? null, d.title ?? null,
        d.body ?? null, d.media_url ?? null, d.release_mode, d.offset_amount ?? null,
        d.offset_unit ?? null, d.release_date ?? null, d.milestone_label ?? null,
      ]
    )
    if (res.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Replace gallery images wholesale.
    await client.query(`DELETE FROM goodbye_gallery_images WHERE message_id = $1`, [params.id])
    if (d.images?.length) {
      for (let i = 0; i < d.images.length; i++) {
        await client.query(
          `INSERT INTO goodbye_gallery_images (message_id, image_url, caption, sort_order)
           VALUES ($1,$2,$3,$4)`,
          [params.id, d.images[i].image_url, d.images[i].caption ?? null, i]
        )
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isAuthor(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Gallery images cascade via FK.
  const res = await query(`DELETE FROM goodbye_messages WHERE id = $1`, [params.id])
  if (res.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
