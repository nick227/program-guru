import { Pencil } from 'lucide-react'

/** Shared identity for Program creation, customization, and confirmation. */
export function ProgramHeader({
  title,
  onTitleChange,
  autoFocus = false,
  disabled = false,
  onConfirm,
}: {
  title: string
  onTitleChange?: (title: string) => void
  autoFocus?: boolean
  disabled?: boolean
  onConfirm?: () => void
}) {
  return (
    <div className="program-header">
      <header className="add-program-heading">
        {onTitleChange ? (
          <div className="program-header__editor">
            <h1 className="sr-only">{title.trim() || 'Add a Program'}</h1>
            <input
              className="program-header__name"
              aria-label="Program name"
              placeholder="Name your Program"
              maxLength={140}
              required
              value={title}
              autoFocus={autoFocus}
              disabled={disabled}
              onChange={(event) => onTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && title.trim()) {
                  event.preventDefault()
                  onConfirm?.()
                }
              }}
            />
            <Pencil size={18} aria-hidden className="program-header__pencil" />
          </div>
        ) : (
          <h1 className="page-title">{title || 'Add a Program'}</h1>
        )}
      </header>
    </div>
  )
}
