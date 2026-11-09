import { forwardRef, useState } from 'react'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
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
    const [voiceEdited, setVoiceEdited] = useState(false)
    const speech = useSpeechRecognition({
      continuous: true,
      onResult: (transcript) => {
        setVoiceEdited(true)
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

    usePwaReloadBlocker(voiceEdited || speech.listening)

    return (
      <div className="relative">
        <textarea
          ref={ref}
          className={cn('textarea', voice && 'pr-9', className)}
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
