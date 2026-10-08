/** Shortens text to at most `max` characters, ending with an ellipsis. */
export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** First letters of the first two words ("John Doe" → "JD"), "?" for an empty name. */
export function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toUpperCase())
    .join('');
  return initials || '?';
}
