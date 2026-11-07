import { Mic, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceButtonProps {
  supported: boolean
  listening: boolean
  onClick: () => void
  className?: string
}

export function VoiceButton({
  supported,
  listening,
  onClick,
  className,
}: VoiceButtonProps) {
  if (!supported) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:text-foreground transition-colors',
        className,
      )}
      aria-label={listening ? 'Stop listening' : 'Start voice input'}
    >
      {listening ? (
        <MicOff size={15} className="text-destructive" />
      ) : (
        <Mic size={15} />
      )}
    </button>
  )
}
