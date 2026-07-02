/**
 * A minimal, framework-free reference holder — the structural shape the DOM host
 * adapters read their backing element(s) through. Deliberately a subset of
 * React's `RefObject<T>` (`{ readonly current: T }`), so a React caller passes
 * its `useRef` result unchanged AND a plain-DOM (vanilla) caller passes a bare
 * `{ current: element }` holder. This is the seam that lets the DOM adapters be
 * genuinely framework-free: they depend on `ElementRef`, never on `react`.
 */
export interface ElementRef<T> {
  readonly current: T;
}
