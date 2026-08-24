import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (same helper the sibling app uses). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
