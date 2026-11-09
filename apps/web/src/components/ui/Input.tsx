import { forwardRef, useState } from 'react'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
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
    const [voiceEdited, setVoiceEdited] = useState(false)
    const speech = useSpeechRecognition({
      onResult: (transcript) => {
        setVoiceEdited(true)
        onVoiceResult?.(transcript)
        onChange?.({
          target: { value: transcript },
        } as React.ChangeEvent<HTMLInputElement>)
      },
      onError: onVoiceError,
    })

    usePwaReloadBlocker(voiceEdited || speech.listening)

    return (
      <div className="relative flex items-center">
        <input
          ref={ref}
          className={cn('input', voice && 'pr-9', className)}
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
