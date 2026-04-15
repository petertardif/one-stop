import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

if (!process.env.PLAID_CLIENT_ID) {
  throw new Error('PLAID_CLIENT_ID environment variable is not set')
}
if (!process.env.PLAID_SECRET) {
  throw new Error('PLAID_SECRET environment variable is not set')
}

const env = process.env.PLAID_ENV ?? 'sandbox'
const baseUrl = PlaidEnvironments[env as keyof typeof PlaidEnvironments]

if (!baseUrl) {
  throw new Error(`Invalid PLAID_ENV: ${env}. Must be sandbox, development, or production`)
}

const configuration = new Configuration({
  basePath: baseUrl,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

// Singleton — server-side only, never import in client components
const globalForPlaid = globalThis as unknown as { plaidClient?: PlaidApi }

export const plaidClient = globalForPlaid.plaidClient ?? new PlaidApi(configuration)

if (process.env.NODE_ENV !== 'production') {
  globalForPlaid.plaidClient = plaidClient
}
