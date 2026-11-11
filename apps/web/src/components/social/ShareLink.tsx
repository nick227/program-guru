import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export interface ShareLinkFieldProps {
  url: string
  shareTitle?: string
  copiedMessage?: string
  inputLabel?: string
  copyLabel?: string
  className?: string
}

/**
 * Reusable read-only URL input with copy-to-clipboard and native device share.
 */
export function ShareLinkField({
  url,
  shareTitle,
  copiedMessage = 'Link copied',
  inputLabel = 'Share link',
  copyLabel = 'Copy link',
  className,
}: ShareLinkFieldProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(copiedMessage)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url })
    } catch {
      // dismissed
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="min-w-0 flex-1">
        <Input
          readOnly
          value={url}
          aria-label={inputLabel}
          className="h-11 sm:h-9 w-full font-mono text-base sm:text-xs select-all bg-surface-muted text-foreground"
          onFocus={(e) => e.target.select()}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 sm:h-9 shrink-0 gap-1.5 px-3.5 text-xs font-semibold"
        onClick={() => void handleCopy()}
      >
        {copied ? (
          <Check size={14} className="text-accent" />
        ) : (
          <Copy size={14} />
        )}
        <span>{copied ? 'Copied' : copyLabel}</span>
      </Button>
      {canShare && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 p-0 text-muted hover:text-foreground"
          aria-label="Share via device"
          onClick={() => void handleNativeShare()}
        >
          <Share2 size={14} />
        </Button>
      )}
    </div>
  )
}

export interface ShareLinkCardProps extends ShareLinkFieldProps {
  title: ReactNode
  ariaLabel: string
  description?: ReactNode
  children?: ReactNode
}

/**
 * Shared card container for entity share links (Programs, Profiles, etc.).
 */
export function ShareLinkCard({
  title,
  ariaLabel,
  description,
  children,
  className,
  ...fieldProps
}: ShareLinkCardProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5',
        className,
      )}
    >
      <SectionHeader title={title} description={description} className="pb-0" />
      {children}
      <ShareLinkField {...fieldProps} />
    </section>
  )
}

