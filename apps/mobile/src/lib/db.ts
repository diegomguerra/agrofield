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
      latitude REAL,
      longitude REAL,
      gps_accuracy REAL,
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
      latitude REAL,
      longitude REAL,
      gps_accuracy REAL,
      fuel_liters REAL,
      fuel_cost REAL,
      observations TEXT,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );

    -- Migração: adiciona colunas GPS em tabelas existentes
    -- (ALTER TABLE IF NOT EXISTS não existe em SQLite, mas ADD COLUMN é ignorado se já existir via try/catch no JS)

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

  // Migração para adicionar colunas GPS em bancos já existentes
  const gpsMigrations = [
    'ALTER TABLE visits ADD COLUMN latitude REAL',
    'ALTER TABLE visits ADD COLUMN longitude REAL',
    'ALTER TABLE visits ADD COLUMN gps_accuracy REAL',
    'ALTER TABLE daily_logs ADD COLUMN latitude REAL',
    'ALTER TABLE daily_logs ADD COLUMN longitude REAL',
    'ALTER TABLE daily_logs ADD COLUMN gps_accuracy REAL',
  ]
  for (const sql of gpsMigrations) {
    try { await db.execAsync(sql) } catch { /* coluna já existe */ }
  }
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
