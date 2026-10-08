const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The time shown next to a chat in the list: "09:05", "Yesterday", "03.01" or "31.12.25". */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000); // rounding absorbs daylight-saving changes
  if (daysAgo <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (daysAgo === 1) return 'Yesterday';
  const dayMonth = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear()
    ? dayMonth
    : `${dayMonth}.${String(date.getFullYear()).slice(-2)}`;
}
