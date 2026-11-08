import { buildApp } from './app'
import { assertProductionConfig } from './lib/config'

async function main() {
  assertProductionConfig('api')
  const app = await buildApp({ logger: true, docs: process.env.NODE_ENV !== 'production' })
  // '::' is dual-stack: IPv4 as before, plus IPv6 for Railway's private network (web → API proxy).
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '::' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
