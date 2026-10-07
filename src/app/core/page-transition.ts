import type { NavigationTransition } from '@nativescript/core';

/** Order of the pages in the drawer: moving to a later page slides left, to an earlier one slides right. */
export const PAGE_ORDER = ['/budget', '/categories', '/stats', '/history', '/settings'];

const DURATION_MS = 250;

export const pushTransition: NavigationTransition = { name: 'slideLeft', duration: DURATION_MS, curve: 'easeInOut' };

export function pageTransition(from: string, to: string): NavigationTransition {
  const fromIndex = PAGE_ORDER.indexOf(from);
  const toIndex = PAGE_ORDER.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return { name: 'fade', duration: DURATION_MS };
  return { name: toIndex > fromIndex ? 'slideLeft' : 'slideRight', duration: DURATION_MS, curve: 'easeInOut' };
}
