import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
export function Back({
  to,
  children = 'Back',
}: {
  to: string
  children?: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 w-fit items-center gap-2 text-muted hover:text-text"
    >
      <ArrowLeft size={16} />
      {children}
    </Link>
  )
}
export const linkButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-surface px-4 font-medium transition-colors hover:bg-surface-muted'
