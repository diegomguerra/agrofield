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

    const { data, error } = await fastify.supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      return reply.unauthorized('Credenciais inválidas')
    }

    // Busca dados do usuário na tabela users (schema em português)
    const { data: user } = await fastify.supabase
      .from('users')
      .select('id, nome, perfil, tenant_id')
      .eq('id', data.user.id)
      .single()

    if (!user) return reply.notFound('Usuário não encontrado')

    const token = fastify.jwt.sign(
      { sub: user.id, tenant_id: user.tenant_id, role: user.perfil },
      { expiresIn: '7d' }
    )

    return reply.send({
      token,
      user: { id: user.id, name: user.nome, role: user.perfil },
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
