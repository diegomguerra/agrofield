import axios from 'axios'
import { getDb } from './db'
import { useAuthStore } from '../store/auth'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Tenta sincronizar todos os itens pendentes da sync_queue com a API.
 * Chamado quando o app detecta conexão disponível.
 */
export async function syncPendingItems(): Promise<{
  synced: number
  failed: number
  errors: { id: string; error: string }[]
}> {
  const db = getDb()
  const token = useAuthStore.getState().token

  if (!token) return { synced: 0, failed: 0, errors: [] }

  // Busca todos os itens não sincronizados
  const pending = await db.getAllAsync<{
    id: string
    table_name: string
    operation: string
    payload: string
    created_at: string
  }>(`SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC`)

  if (!pending.length) return { synced: 0, failed: 0, errors: [] }

  try {
    const response = await axios.post(
      `${API_URL}/sync`,
      {
        items: pending.map((item) => ({
          id: item.id,
          table_name: item.table_name,
          operation: item.operation,
          payload: JSON.parse(item.payload),
          created_at: item.created_at,
        })),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const { errors } = response.data as {
      processed: number
      success: number
      errors: { id: string; error: string }[]
    }

    const errorIds = new Set(errors.map((e) => e.id))
    const successIds = pending.map((p) => p.id).filter((id) => !errorIds.has(id))

    // Marca como sincronizados os que passaram
    if (successIds.length) {
      const placeholders = successIds.map(() => '?').join(',')
      await db.runAsync(
        `UPDATE sync_queue SET synced_at = datetime('now') WHERE id IN (${placeholders})`,
        successIds
      )
    }

    return {
      synced: successIds.length,
      failed: errors.length,
      errors,
    }
  } catch (err: any) {
    console.warn('[Sync] Falha na sincronização:', err.message)
    return { synced: 0, failed: pending.length, errors: [] }
  }
}

/**
 * Adiciona um item à fila de sincronização
 */
export async function enqueue(
  table_name: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>,
  queueId: string
): Promise<void> {
  const db = getDb()
  await db.runAsync(
    `INSERT INTO sync_queue (id, table_name, operation, payload) VALUES (?, ?, ?, ?)`,
    [queueId, table_name, operation, JSON.stringify(payload)]
  )
}
