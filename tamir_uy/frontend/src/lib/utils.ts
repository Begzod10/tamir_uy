import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS class names with clsx support.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format tiyin (1/100 of soʻm) as human-readable UZS currency.
 * Example: 124000000 -> "1 240 000 soʻm"
 */
export function formatUZS(tiyin: number): string {
  const soum = Math.trunc(tiyin / 100);
  const formatted = soum
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " "); // thin space
  return `${formatted} soʻm`;
}

/**
 * Format area in square metres.
 * Example: 12.4 -> "12.4 m²"
 */
export function formatArea(m2: number): string {
  const rounded = Math.round(m2 * 10) / 10;
  return `${rounded} m²`;
}

/**
 * Clamp a value between min and max (inclusive).
 */
export function clampValue(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
