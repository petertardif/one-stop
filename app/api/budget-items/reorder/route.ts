import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) })

// POST /api/budget-items/reorder — { ids } in the new display order. Rewrites
// each item's sort_order to its position in the array (1-based). Scoped to the
// caller's own rows, so only the reordered set is renumbered.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await query(
    `UPDATE budget_items AS b
     SET sort_order = v.ord, updated_at = NOW()
     FROM unnest($2::uuid[]) WITH ORDINALITY AS v(id, ord)
     WHERE b.id = v.id AND b.user_id = $1`,
    [session.user.id, parsed.data.ids]
  )

  return NextResponse.json({ ok: true })
}
