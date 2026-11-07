import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionResultLike = {
  readonly [index: number]: { transcript: string }
}

type SpeechRecognitionResultListLike = {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  onresult:
    | ((event: { results: SpeechRecognitionResultListLike }) => void)
    | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognition

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

type SpeechRecognition = SpeechRecognitionLike

type Options = {
  continuous?: boolean
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition({
  continuous,
  onResult,
  onError,
}: Options = {}) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()))
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      onError?.('Speech recognition is not supported in this browser.')
      return
    }

    stop()

    const recognition = new SpeechRecognition()
    recognition.continuous = Boolean(continuous)
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index],
      )
        .map((result) => result?.[0]?.transcript ?? '')
        .join(' ')
      onResult?.(transcript)
    }
    recognition.onerror = (event) => onError?.(event.error)
    recognition.onend = () => setListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }, [continuous, onError, onResult, stop])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(() => stop, [stop])

  return { supported, listening, start, stop, toggle }
}
