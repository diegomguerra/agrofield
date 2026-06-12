/**
 * Script para criar usuários no AgroField.
 * Cria o usuário no Supabase Auth E na tabela users em uma operação.
 *
 * Uso:
 *   npx tsx scripts/create-user.ts \
 *     --email fulano@exemplo.com \
 *     --password SenhaSegura123 \
 *     --nome "Fulano de Tal" \
 *     --perfil tecnico \
 *     --tenant_id <uuid-do-tenant>
 *
 * Ou defina as vars SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), 'apps/api/.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo apps/api/.env')
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const email = arg('email')
const password = arg('password')
const nome = arg('nome')
const perfil = arg('perfil') as 'admin' | 'tecnico' | 'operador' | undefined
const tenant_id = arg('tenant_id') ?? randomUUID()

if (!email || !password || !nome || !perfil) {
  console.error('Uso: npx tsx scripts/create-user.ts --email E --password S --nome N --perfil P [--tenant_id T]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  console.log(`\nCriando usuário: ${email}`)

  // 1. Cria no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    // Se já existe, tenta buscar para sincronizar a tabela users
    if (authError.message.toLowerCase().includes('already registered')) {
      console.warn('⚠️   Usuário já existe no Auth. Tentando sincronizar tabela users...')
      const { data: list } = await supabase.auth.admin.listUsers()
      const existing = list?.users.find((u) => u.email === email)
      if (!existing) {
        console.error('❌  Não foi possível localizar o usuário existente.')
        process.exit(1)
      }
      await upsertUsersTable(existing.id)
      return
    }
    console.error('❌  Erro no Auth:', authError.message)
    process.exit(1)
  }

  await upsertUsersTable(authData.user.id)
}

async function upsertUsersTable(id: string) {
  const { error: dbError } = await supabase
    .from('users')
    .upsert({ id, nome, perfil, tenant_id }, { onConflict: 'id' })

  if (dbError) {
    console.error('❌  Erro na tabela users:', dbError.message)
    process.exit(1)
  }

  console.log('\n✅  Usuário criado/sincronizado com sucesso!')
  console.log(`   ID:        ${id}`)
  console.log(`   Email:     ${email}`)
  console.log(`   Nome:      ${nome}`)
  console.log(`   Perfil:    ${perfil}`)
  console.log(`   Tenant ID: ${tenant_id}`)
}

run()
