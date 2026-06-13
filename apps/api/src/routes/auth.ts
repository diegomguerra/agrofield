import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)

    // Validate password directly against auth.users using pgcrypto crypt()
    const { data: authResult, error: authError } = await fastify.supabase.rpc(
      'verify_password',
      { p_email: email, p_password: password }
    )

    if (authError || !authResult || authResult.length === 0) {
      return reply.unauthorized('Credenciais inválidas')
    }

    const authUser = Array.isArray(authResult) ? authResult[0] : authResult
    if (!authUser?.id) {
      return reply.unauthorized('Credenciais inválidas')
    }

    // Busca dados do usuário na tabela users (schema em português)
    const { data: user } = await fastify.supabase
      .from('users')
      .select('id, nome, perfil, tenant_id')
      .eq('id', authUser.id)
      .single()

    if (!user) return reply.notFound('Usuário não encontrado')

    const token = fastify.jwt.sign(
      { sub: user.id, tenant_id: user.tenant_id, role: user.perfil },
      { expiresIn: '7d' }
    )

    return reply.send({
      token,
      user: { id: user.id, name: user.nome, role: user.perfil, tenant_id: user.tenant_id },
    })
  })

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    try {
      const payload = await request.jwtVerify<{
        sub: string
        tenant_id: string
        role: string
      }>()

      const token = fastify.jwt.sign(
        { sub: payload.sub, tenant_id: payload.tenant_id, role: payload.role },
        { expiresIn: '7d' }
      )

      return reply.send({ token })
    } catch {
      return reply.unauthorized('Token inválido')
    }
  })
}
