/**
 * Decoder de JWT puro (sem verificação) — apenas extrai o payload.
 * Usado pra ler claims como tenant_id e sub direto do token,
 * independente do que a API retorna no body do /auth/login.
 */
export function decodeJwt<T = Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  const base64Url = parts[1]
  // base64url → base64
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  try {
    // atob é nativo em Hermes desde RN 0.72; fallback manual se não.
    const json =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        : decodeBase64Manual(padded)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function decodeBase64Manual(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let out = ''
  let buffer = 0
  let bits = 0
  for (const c of str) {
    if (c === '=') break
    const v = chars.indexOf(c)
    if (v < 0) continue
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return out
}
