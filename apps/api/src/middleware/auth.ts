import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'

const PUBLIC_ROUTES = ['/health', '/auth/login', '/auth/refresh']

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (PUBLIC_ROUTES.includes(request.url)) return

  try {
    await request.jwtVerify()
  } catch {
    reply.unauthorized('Token inválido ou expirado')
  }
}
