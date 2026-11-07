import { buildApp } from './app'

async function main() {
  const app = await buildApp({ logger: true, docs: process.env.NODE_ENV !== 'production' })
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
