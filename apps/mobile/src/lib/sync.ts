import axios from 'axios'
import { getDb } from './db'
import { useAuthStore } from '../store/auth'

const API_URL = 'https://agrofieldapi-production.up.railway.app'

export async function syncProperties(): Promise<void> {
  const token = useAuthStore.getState().token
  if (!token) return
  try {
    const { data } = await axios.get(`${API_URL}/properties`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const db = getDb()
    for (const p of data) {
      await db.runAsync(
        `INSERT OR REPLACE INTO properties
          (id, name, tipo, city, area_hectares, latitude, longitude, tenant_id, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          p.id, p.name, p.tipo, p.city ?? null, p.area_hectares ?? null,
          p.latitude ?? null, p.longitude ?? null,
          p.tenant_id,
        ]
      )
    }
  } catch (err) {
    console.warn('[Sync] Propriedades:', err)
  }
}

export async function enqueue(
  table_name: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>,
  queueId: string
): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO sync_queue (id, table_name, operation, payload) VALUES (?, ?, ?, ?)`,
    [queueId, table_name, operation, JSON.stringify(payload)]
  )
}

export async function syncPendingItems(): Promise<{ synced: number; failed: number }> {
  const db = getDb()
  const token = useAuthStore.getState().token
  if (!token) return { synced: 0, failed: 0 }

  const pending = await db.getAllAsync<{
    id: string; table_name: string; operation: string; payload: string; created_at: string
  }>(`SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 50`)

  if (!pending.length) return { synced: 0, failed: 0 }

  try {
    const { data } = await axios.post(
      `${API_URL}/sync`,
      { items: pending.map(i => ({ ...i, payload: JSON.parse(i.payload) })) },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const errorIds = new Set((data.errors ?? []).map((e: any) => e.id))
    const successIds = pending.map(p => p.id).filter(id => !errorIds.has(id))
    if (successIds.length) {
      const ph = successIds.map(() => '?').join(',')
      await db.runAsync(`UPDATE sync_queue SET synced_at = datetime('now') WHERE id IN (${ph})`, successIds)
    }
    return { synced: successIds.length, failed: data.errors?.length ?? 0 }
  } catch {
    return { synced: 0, failed: pending.length }
  }
}
