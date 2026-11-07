import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from './voice/useSpeechRecognition'
import { VoiceButton } from './voice/VoiceButton'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  voice?: boolean
  voiceMode?: 'replace' | 'append'
  onVoiceResult?: (transcript: string) => void
  onVoiceError?: (error: string) => void
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      voice,
      voiceMode = 'append',
      onVoiceResult,
      onVoiceError,
      onChange,
      value,
      ...props
    },
    ref,
  ) => {
    const speech = useSpeechRecognition({
      continuous: true,
      onResult: (transcript) => {
        const nextValue =
          voiceMode === 'append' && typeof value === 'string' && value.trim()
            ? `${value.trimEnd()} ${transcript}`
            : transcript
        onVoiceResult?.(nextValue)
        onChange?.({
          target: { value: nextValue },
        } as React.ChangeEvent<HTMLTextAreaElement>)
      },
      onError: onVoiceError,
    })

    return (
      <div className="relative">
        <textarea
          ref={ref}
          className={cn(
            'flex w-full rounded border border-input-border bg-transparent px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'resize-none',
            voice && 'pr-9',
            className,
          )}
          value={value}
          onChange={onChange}
          {...props}
        />
        {voice && (
          <VoiceButton
            supported={speech.supported}
            listening={speech.listening}
            onClick={speech.toggle}
            className="absolute right-2 top-2"
          />
        )}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
