import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildApp } from '../src/app.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await buildApp()
  await app.ready()
  app.server.emit('request', req, res)
}
