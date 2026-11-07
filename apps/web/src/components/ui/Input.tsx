import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from './voice/useSpeechRecognition'
import { VoiceButton } from './voice/VoiceButton'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  voice?: boolean
  onVoiceResult?: (transcript: string) => void
  onVoiceError?: (error: string) => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, voice, onVoiceResult, onVoiceError, onChange, ...props },
    ref,
  ) => {
    const speech = useSpeechRecognition({
      onResult: (transcript) => {
        onVoiceResult?.(transcript)
        onChange?.({
          target: { value: transcript },
        } as React.ChangeEvent<HTMLInputElement>)
      },
      onError: onVoiceError,
    })

    return (
      <div className="relative flex items-center">
        <input
          ref={ref}
          className={cn(
            'flex h-11 w-full rounded-lg border border-input-border bg-transparent px-3 py-1 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            voice && 'pr-9',
            className,
          )}
          onChange={onChange}
          {...props}
        />
        {voice && (
          <VoiceButton
            supported={speech.supported}
            listening={speech.listening}
            onClick={speech.toggle}
            className="absolute right-2"
          />
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
