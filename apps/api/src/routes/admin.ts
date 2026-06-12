import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nome: z.string().min(1),
  perfil: z.enum(['admin', 'tecnico', 'operador']),
  tenant_id: z.string().uuid(),
})

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Protege todas as rotas admin: só perfil 'admin' pode acessar
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const user = request.user as { role?: string } | undefined
      if (!user || user.role !== 'admin') {
        return reply.forbidden('Acesso restrito a administradores')
      }
    } catch {
      return reply.unauthorized('Token inválido')
    }
  })

  // POST /admin/users — cria usuário no Supabase Auth + tabela users
  fastify.post('/users', async (request, reply) => {
    const { email, password, nome, perfil, tenant_id } = createUserSchema.parse(request.body)

    // 1. Cria no Supabase Auth
    const { data: authData, error: authError } = await fastify.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return reply.badRequest(authError?.message ?? 'Erro ao criar usuário no Auth')
    }

    // 2. Insere na tabela users
    const { error: dbError } = await fastify.supabase
      .from('users')
      .insert({ id: authData.user.id, nome, perfil, tenant_id })

    if (dbError) {
      // Rollback: remove o usuário do Auth se a inserção no DB falhar
      await fastify.supabase.auth.admin.deleteUser(authData.user.id)
      return reply.internalServerError(`Erro ao inserir na tabela users: ${dbError.message}`)
    }

    return reply.code(201).send({
      id: authData.user.id,
      email,
      nome,
      perfil,
      tenant_id,
    })
  })

  // GET /admin/users — lista usuários com dados da tabela users
  fastify.get('/users', async (_request, reply) => {
    const { data, error } = await fastify.supabase
      .from('users')
      .select('id, nome, perfil, tenant_id')
      .order('nome')

    if (error) return reply.internalServerError(error.message)
    return reply.send(data)
  })
}
