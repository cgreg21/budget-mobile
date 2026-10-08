import { CoreTypes, ScrollView, Screen, type ScrollEventData, type View } from '@nativescript/core';

const OFFSET = 28;
const DURATION = 260;
const STAGGER = 45;
const MAX_STAGGERED = 10;
/** Time left to the first layout pass before the rows are measured. */
const MEASURE_DELAY = 40;

interface RowState {
  shown: boolean;
  animation: ReturnType<View['animate']> | null;
}

/**
 * Fades rows in each time they come into view, whichever way the list is scrolled. A row is
 * hidden again once it is entirely out of view, so it animates again when it comes back. Rows
 * always rise from below: moving up from a lower position, a row never slides over the row above
 * it. The rows on screen when the list is built appear one after the other.
 */
export class ListReveal {
  private readonly lists = new Map<ScrollView, Map<View, RowState>>();
  private readonly scheduled = new Set<ScrollView>();

  /** Hides a freshly loaded row; it is revealed once its position is known. */
  add(row: View): void {
    const scroll = this.scrollViewOf(row);
    if (!scroll) return;
    for (const known of this.lists.keys()) {
      if (!known.isLoaded) {
        this.lists.delete(known);
      }
    }
    row.opacity = 0;
    row.translateY = OFFSET;
    const rows = this.lists.get(scroll) ?? new Map<View, RowState>();
    rows.set(row, { shown: false, animation: null });
    this.lists.set(scroll, rows);
    this.schedule(scroll);
  }

  onScroll(args: ScrollEventData): void {
    this.update(args.object as ScrollView, false);
  }

  private schedule(scroll: ScrollView): void {
    if (this.scheduled.has(scroll)) return;
    this.scheduled.add(scroll);
    setTimeout(() => {
      this.scheduled.delete(scroll);
      this.update(scroll, true);
    }, MEASURE_DELAY);
  }

  private update(scroll: ScrollView, staggered: boolean): void {
    const rows = this.lists.get(scroll);
    if (!rows) return;
    const viewport = scroll.getActualSize().height || Screen.mainScreen.heightDIPs;
    let index = 0;
    for (const [row, state] of rows) {
      if (!row.isLoaded) {
        rows.delete(row);
        continue;
      }
      const top = row.getLocationRelativeTo(scroll).y;
      const visible = top < viewport && top + row.getActualSize().height > 0;
      if (visible && !state.shown) {
        this.reveal(row, state, staggered ? Math.min(index++, MAX_STAGGERED) * STAGGER : 0);
      } else if (!visible && state.shown) {
        this.hide(row, state);
      }
    }
  }

  private reveal(row: View, state: RowState, delay: number): void {
    state.shown = true;
    row.translateY = OFFSET;
    state.animation = row.animate({
      opacity: 1,
      translate: { x: 0, y: 0 },
      duration: DURATION,
      delay,
      curve: CoreTypes.AnimationCurve.easeOut,
    });
    state.animation.catch(() => undefined);
  }

  private hide(row: View, state: RowState): void {
    state.shown = false;
    state.animation?.cancel();
    state.animation = null;
    row.opacity = 0;
  }

  private scrollViewOf(row: View): ScrollView | null {
    for (let view = row.parent; view; view = view.parent) {
      if (view instanceof ScrollView) return view;
    }
    return null;
  }
}
