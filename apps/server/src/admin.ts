// Initial admin bootstrap (12-SOCIAL §7a). An explicit server-side command, run by an operator with
// database access; there is no HTTP, environment or seed path that grants ADMIN.
//   local:      pnpm --filter server admin grant someone@example.com
//   production: pnpm --filter server admin:prod grant someone@example.com   (inside the API service)
// Promotes or demotes an existing account. Idempotent, audited, and refuses to remove the last admin.
import { db } from '@project/db'
import { setAdminByEmail } from './domains/admin/users.service'
import { AppError } from './lib/errors'

const usage = 'Usage: admin <grant|revoke> <email>   |   admin list'

async function main() {
  const [command, email] = process.argv.slice(2)
  if (command === 'list') {
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, status: true }, orderBy: { email: 'asc' } })
    console.log(JSON.stringify({ admins }))
    return
  }
  if ((command !== 'grant' && command !== 'revoke') || !email) {
    console.error(usage)
    process.exitCode = 2
    return
  }
  const result = await setAdminByEmail(email, command === 'grant')
  console.log(JSON.stringify(result))
}

main()
  .catch((err) => {
    console.error(err instanceof AppError ? `[admin] ${err.message}` : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
