import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('avatar') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })
    }

    const bytes = await file.bytes()
    if (bytes.length === 0) {
      return NextResponse.json({ error: 'File appears to be empty' }, { status: 400 })
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
    const filename = `${session.user.id}.${ext}`
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars')

    await mkdir(uploadsDir, { recursive: true })
    await writeFile(path.join(uploadsDir, filename), bytes)

    const avatarUrl = `/uploads/avatars/${filename}`

    await query(
      `INSERT INTO user_profiles (user_id, avatar_url)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = NOW()`,
      [session.user.id, avatarUrl]
    )

    return NextResponse.json({ avatarUrl })
  } catch (err) {
    console.error('Avatar upload error:', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
