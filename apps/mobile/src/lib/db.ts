import * as SQLite from 'expo-sqlite'

let _db: SQLite.SQLiteDatabase | null = null

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('agrofield.db')
  }
  return _db
}

/**
 * Schema versionado com migrations incrementais.
 * Cada migration roda uma unica vez e nunca mais.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
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

      CREATE TABLE IF NOT EXISTS visit_inputs (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id),
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS visit_services (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id),
        service_type_id TEXT NOT NULL,
        quantity REAL,
        unit_price REAL,
        observations TEXT
      );

      CREATE TABLE IF NOT EXISTS visit_sales (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id),
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT
      );
    `,
  },
  {
    version: 2,
    sql: `
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
    `,
  },
  {
    // Fix: tabelas criadas antes do schema versionado podem ter typo
    // ou colunas faltando. Garante que tudo existe.
    version: 3,
    sql: `
      SELECT 1; -- placeholder, migrations manuais abaixo
    `,
  },
]

// Migrations manuais que precisam de try/catch individual (ADD COLUMN etc)
const MANUAL_MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 3,
    statements: [
      // Colunas GPS que podem ja existir
      'ALTER TABLE visits ADD COLUMN latitude REAL',
      'ALTER TABLE visits ADD COLUMN longitude REAL',
      'ALTER TABLE visits ADD COLUMN gps_accuracy REAL',
      'ALTER TABLE daily_logs ADD COLUMN latitude REAL',
      'ALTER TABLE daily_logs ADD COLUMN longitude REAL',
      'ALTER TABLE daily_logs ADD COLUMN gps_accuracy REAL',
      'ALTER TABLE properties ADD COLUMN latitude REAL',
      'ALTER TABLE properties ADD COLUMN longitude REAL',
      // Fix typo de versoes anteriores (coluna pode nao existir se tabela foi criada corretamente)
      'ALTER TABLE journeys ADD COLUMN average_speed_kmh REAL',
    ],
  },
]

export async function initDb(): Promise<void> {
  const db = getDb()

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)

  // Descobre versao atual
  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_version'
  )
  const currentVersion = rows[0]?.version ?? 0

  // Roda migrations pendentes
  for (const m of MIGRATIONS) {
    if (m.version <= currentVersion) continue
    await db.execAsync(m.sql)
    await db.runAsync('INSERT OR IGNORE INTO schema_version (version) VALUES (?)', [m.version])
  }

  // Roda migrations manuais (try/catch individual)
  for (const m of MANUAL_MIGRATIONS) {
    if (m.version <= currentVersion) continue
    for (const stmt of m.statements) {
      try { await db.execAsync(stmt) } catch { /* coluna ja existe */ }
    }
  }

  // Garante que tabelas de versoes anteriores ao schema_version existam
  // (app ja instalado antes da v3)
  if (currentVersion === 0) {
    // App existente sem schema_version — marca tudo como rodado
    // pois as tabelas ja foram criadas pelo initDb antigo
    const hasJourneys = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='journeys'"
    )
    if (hasJourneys.length > 0) {
      // Tabelas ja existem, marca todas as migrations como feitas
      for (const m of MIGRATIONS) {
        await db.runAsync('INSERT OR IGNORE INTO schema_version (version) VALUES (?)', [m.version])
      }
      // Roda as manuais de qualquer forma (sao idempotentes)
      for (const m of MANUAL_MIGRATIONS) {
        for (const stmt of m.statements) {
          try { await db.execAsync(stmt) } catch { /* ja existe */ }
        }
      }
    }
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
