import { query } from './db'

export async function getAppSettings(): Promise<Record<string, boolean>> {
  const result = await query(`SELECT key, value FROM app_settings`)
  const settings: Record<string, boolean> = {}
  for (const row of result.rows) {
    settings[row.key] = row.value === 'true'
  }
  return settings
}
