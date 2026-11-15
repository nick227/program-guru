/** "Looking for" notes (10 §9.12) often already start with those words; never print them twice. */
export function lookingForText(note: string): string {
  return /^looking for\b/i.test(note.trim()) ? note.trim() : `Looking for: ${note.trim()}`
}
