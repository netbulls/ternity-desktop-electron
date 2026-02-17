/** Scale a pixel value by the --t-scale CSS variable (default 1.1) */
export function scaled(px: number): string {
  return `calc(${px}px * var(--t-scale, 1.1))`;
}
