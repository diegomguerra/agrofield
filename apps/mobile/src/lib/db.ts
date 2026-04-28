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

    -- Propriedades (cache somente leitura, mas pode ser criado offline)
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('propria', 'cliente')),
      city TEXT,
      area_hectares REAL,
      latitude REAL,
      longitude REAL,
      tenant_id TEXT NOT NULL,
      synced_at TEXT
    );

    -- Viagens (1ª saída do dia → ponto de chegada, distância e tempo)
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      collaborator_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      start_latitude REAL,
      start_longitude REAL,
      end_latitude REAL,
      end_longitude REAL,
      start_property_id TEXT,
      end_property_id TEXT,
      distance_km REAL,
      duration_minutes REAL,
      observations TEXT,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

    -- Jornadas (1 por dia por colaborador)
    CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY,
      collaborator_id TEXT NOT NULL,
      date TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      total_distance_km REAL,
      total_travel_minutes REAL,
      total_stay_minutes REAL,
      average_speed_kmh REAL,
      km_odometer_start REAL,
      km_odometer_end REAL,
      origin_property_id TEXT,
      origin_name TEXT,
      origin_city TEXT,
      objective TEXT,
      client_name TEXT,
      invoice_number TEXT,
      invoice_value REAL,
      vehicle_type TEXT,
      vehicle_plate TEXT,
      fuel_type TEXT,
      fuel_price_per_liter REAL,
      observations TEXT,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );

    -- Segmentos de jornada (deslocamento ou permanencia)
    CREATE TABLE IF NOT EXISTS journey_segments (
      id TEXT PRIMARY KEY,
      journey_id TEXT NOT NULL REFERENCES journeys(id),
      seq INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('travel','stay')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes REAL,
      start_latitude REAL,
      start_longitude REAL,
      end_latitude REAL,
      end_longitude REAL,
      distance_km REAL,
      property_id TEXT,
      location_name TEXT,
      observations TEXT,
      work_hours REAL,
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

  // Migração: ALTER TABLE ADD COLUMN é idempotente via try/catch
  const migrations = [
    'ALTER TABLE visits ADD COLUMN latitude REAL',
    'ALTER TABLE visits ADD COLUMN longitude REAL',
    'ALTER TABLE visits ADD COLUMN gps_accuracy REAL',
    'ALTER TABLE daily_logs ADD COLUMN latitude REAL',
    'ALTER TABLE daily_logs ADD COLUMN longitude REAL',
    'ALTER TABLE daily_logs ADD COLUMN gps_accuracy REAL',
    'ALTER TABLE properties ADD COLUMN latitude REAL',
    'ALTER TABLE properties ADD COLUMN longitude REAL',
  ]
  for (const sql of migrations) {
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
