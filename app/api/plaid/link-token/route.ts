import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { CountryCode, Products } from 'plaid'
import { authOptions } from '@/lib/auth'
import { plaidClient } from '@/lib/plaid'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: session.user.id },
    client_name: 'One Stop',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  })

  return NextResponse.json({ link_token: response.data.link_token })
}
