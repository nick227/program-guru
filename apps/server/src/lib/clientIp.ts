// Client IP for rate limiting and view de-duplication, behind Railway's edge proxy.
//
// Railway documents one client-IP header: X-Real-IP ("for identifying client's remote IP"). Its handling
// of X-Forwarded-For and the proxy's source addresses are not documented, so:
//   - X-Forwarded-For is never read (clients can send anything in it);
//   - X-Real-IP is used only when explicitly enabled (CLIENT_IP_HEADER=x-real-ip) AND the TCP peer is a
//     trusted proxy address (TRUSTED_PROXY_CIDRS; default: private and CGNAT ranges, which public
//     clients cannot connect from);
//   - otherwise the socket address is the client.
// A request that reaches the API directly from the internet therefore cannot choose its own rate-limit
// identity, and clients behind the proxy no longer share the proxy's address.
import { BlockList, isIP } from 'net'

export const DEFAULT_TRUSTED_PROXY_CIDRS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', 'fc00::/7']
const SUPPORTED_HEADERS = new Set(['x-real-ip'])

type Config = { header: string | null; trusted: BlockList }
let cached: { key: string; config: Config } | undefined

/** Normalizes IPv4-mapped IPv6 (::ffff:10.0.0.1) so IPv4 ranges match. */
const unmap = (address: string) => (address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address)

export function parseClientIpConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const name = env.CLIENT_IP_HEADER?.trim().toLowerCase()
  const header = name && SUPPORTED_HEADERS.has(name) ? name : null
  const trusted = new BlockList()
  const cidrs = env.TRUSTED_PROXY_CIDRS?.trim() ? env.TRUSTED_PROXY_CIDRS.split(',') : DEFAULT_TRUSTED_PROXY_CIDRS
  for (const raw of cidrs) {
    const [net, bits] = raw.trim().split('/')
    const family = isIP(net ?? '')
    if (!family) throw new Error(`TRUSTED_PROXY_CIDRS: "${raw.trim()}" is not an IP range`)
    const prefix = bits === undefined ? (family === 4 ? 32 : 128) : Number(bits)
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) throw new Error(`TRUSTED_PROXY_CIDRS: bad prefix in "${raw.trim()}"`)
    trusted.addSubnet(net!, prefix, family === 4 ? 'ipv4' : 'ipv6')
  }
  return { header, trusted }
}

function config() {
  const key = `${process.env.CLIENT_IP_HEADER ?? ''}|${process.env.TRUSTED_PROXY_CIDRS ?? ''}`
  if (cached?.key !== key) cached = { key, config: parseClientIpConfig() }
  return cached.config
}

export function clientIp(request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const peer = unmap(request.ip || '127.0.0.1')
  const { header, trusted } = config()
  if (!header) return peer
  const family = isIP(peer)
  if (!family || !trusted.check(peer, family === 4 ? 'ipv4' : 'ipv6')) return peer
  const value = request.headers[header]
  // One proxy-set value only; a repeated header is ambiguous, so fall back to the peer.
  if (typeof value !== 'string') return peer
  const candidate = unmap(value.trim())
  return isIP(candidate) ? candidate : peer
}
