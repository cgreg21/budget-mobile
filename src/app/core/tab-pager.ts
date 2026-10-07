import { CoreTypes, Screen, type View } from '@nativescript/core';

const SLIDE_MS = 250;

/**
 * Keeps every tab panel laid out in the same cell and slides them sideways to switch tabs.
 * Panels stay rendered the whole time, so nothing is created or measured during the animation.
 */
export class TabPager {
  private readonly panels: View[] = [];
  private index = 0;
  private busy = false;

  /** Registers the panel of the tab at `index` (called from its `loaded` event). */
  register(index: number, panel: View): void {
    this.panels[index] = panel;
    panel.translateX = this.restingOffset(index);
  }

  /** Returns false when a slide is already running and the request was ignored. */
  show(next: number): boolean {
    if (next === this.index) return true;
    if (this.busy) return false;
    const from = this.panels[this.index];
    const to = this.panels[next];
    const previous = this.index;
    this.index = next;
    if (!from?.isLoaded || !to?.isLoaded) {
      this.panels.forEach((panel, i) => { if (panel) panel.translateX = this.restingOffset(i); });
      return true;
    }

    this.busy = true;
    const width = Screen.mainScreen.widthDIPs;
    const direction = next > previous ? 1 : -1;
    const animation = { duration: SLIDE_MS, curve: CoreTypes.AnimationCurve.easeInOut };
    Promise.all([
      from.animate({ translate: { x: -direction * width, y: 0 }, ...animation }),
      to.animate({ translate: { x: 0, y: 0 }, ...animation }),
    ]).catch(() => undefined).finally(() => {
      this.panels.forEach((panel, i) => { if (panel) panel.translateX = this.restingOffset(i); });
      this.busy = false;
    });
    return true;
  }

  /** The active panel is in place; the others wait out of sight on their own side. */
  private restingOffset(index: number): number {
    if (index === this.index) return 0;
    return (index < this.index ? -1 : 1) * Screen.mainScreen.widthDIPs;
  }
}
