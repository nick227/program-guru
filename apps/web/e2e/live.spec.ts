import { test } from '@playwright/test'
import { journey } from './journey'
test('live API: seeded discovery → author → publish → join → Finish/Undo', async ({
  page,
}) => {
  const names = [
    'E2E_AUTHOR_EMAIL',
    'E2E_AUTHOR_PASSWORD',
    'E2E_PARTICIPANT_EMAIL',
    'E2E_PARTICIPANT_PASSWORD',
  ] as const
  for (const name of names)
    if (!process.env[name])
      throw new Error(
        `Live test requires ${name}; see apps/web/README.md. No database setup or reset is performed.`,
      )
  await journey(page, {
    author: [process.env.E2E_AUTHOR_EMAIL!, process.env.E2E_AUTHOR_PASSWORD!],
    participant: [
      process.env.E2E_PARTICIPANT_EMAIL!,
      process.env.E2E_PARTICIPANT_PASSWORD!,
    ],
  })
})
