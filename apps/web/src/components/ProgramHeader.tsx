import { Pencil } from 'lucide-react'

/** Shared identity for Program creation, customization, and confirmation. */
export function ProgramHeader({
  title,
  label,
  onTitleChange,
  autoFocus = false,
  disabled = false,
  onConfirm,
}: {
  title: string
  label?: string
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
            <h1 className="sr-only">{title.trim() || `Add a ${label ?? 'Program'}`}</h1>
            <input
              className="program-header__name"
              aria-label="Program name"
              placeholder={`Name your ${label ?? 'Program'}`}
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
          </div>
        ) : (
          <h1 className="page-title">{title || 'Add Program'}</h1>
        )}
      </header>
    </div>
  )
}
