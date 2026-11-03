const MONTHS: ReadonlyArray<string> = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-11-04` -> `4 Nov 2026` (no locale lookups, so the build prints the same text everywhere). */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Whole minutes to read a body of this many words (200 words a minute, at least one). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** Escape the characters that would end a markdown link's text early (`[`, `]`, `(`, `)`, `\`). */
export function escapeLinkText(text: string): string {
  return text.replace(/[\\\[\]()]/g, (char): string => `\\${char}`);
}
