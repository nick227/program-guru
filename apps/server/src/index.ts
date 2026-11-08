import { buildApp } from './app'
import { assertProductionConfig } from './lib/config'

async function main() {
  assertProductionConfig('api')
  const app = await buildApp({ logger: true, docs: process.env.NODE_ENV !== 'production' })
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
