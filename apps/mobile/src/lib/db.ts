import * as SQLite from 'expo-sqlite'

let _db: SQLite.SQLiteDatabase | null = null

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('agrofield.db')
  }
  return _db
}

/**
 * Inicializa todas as tabelas locais.
 * Chamado uma vez no boot do app.
 */
export async function initDb(): Promise<void> {
  const db = getDb()

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Propriedades (cache somente leitura)
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('propria', 'cliente')),
      city TEXT,
      area_hectares REAL,
      tenant_id TEXT NOT NULL,
      synced_at TEXT
    );

    -- Visitas criadas localmente
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      collaborator_id TEXT NOT NULL,
      vehicle_id TEXT,
      date TEXT NOT NULL,
      km_start REAL,
      km_end REAL,
      observations TEXT,
      work_hours REAL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );

    -- Insumos de visitas próprias
    CREATE TABLE IF NOT EXISTS visit_inputs (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id),
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL
    );

    -- Serviços de visitas clientes
    CREATE TABLE IF NOT EXISTS visit_services (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id),
      service_type_id TEXT NOT NULL,
      quantity REAL,
      unit_price REAL,
      observations TEXT
    );

    -- Vendas de visitas clientes
    CREATE TABLE IF NOT EXISTS visit_sales (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id),
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL
    );

    -- Logs diários de KM
    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      collaborator_id TEXT NOT NULL,
      vehicle_id TEXT,
      km_start REAL,
      km_end REAL,
      fuel_liters REAL,
      fuel_cost REAL,
      observations TEXT,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );

    -- Fila de sincronização
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );
  `)
}

/**
 * Gera um UUID v4 simples para IDs locais
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
