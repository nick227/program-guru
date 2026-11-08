// Session-scoped MySQL statement counter for workload budgets in tests.
import { db } from '@project/db'

async function sessionQuestions() {
  const rows = await db.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>("SHOW SESSION STATUS LIKE 'Questions'")
  return Number(rows[0]!.Value)
}

/** Runs `fn` and returns how many SQL statements it issued on this connection (approx). */
export async function withQueryCount<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  const before = await sessionQuestions()
  const result = await fn()
  const after = await sessionQuestions()
  // Subtract the final SHOW SESSION STATUS itself.
  return { result, queries: after - before - 1 }
}
