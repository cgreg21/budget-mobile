import { signal, type WritableSignal } from '@angular/core';
import { CoreTypes, Screen, type View } from '@nativescript/core';

const SLIDE_MS = 250;

/**
 * Tabs whose panels share one cell and slide sideways to switch, in the order of `keys`.
 * Panels stay rendered the whole time, so nothing is created or measured during the animation.
 */
export class TabPager<K extends string> {
  private readonly current: WritableSignal<K>;
  private readonly panels = new Map<K, View>();
  private busy = false;

  constructor(private readonly keys: readonly K[]) {
    this.current = signal(keys[0]);
  }

  /** Registers the panel of `key` (called from its `loaded` event). */
  register(key: K, panel: View): void {
    this.panels.set(key, panel);
    panel.translateX = this.restingOffset(key);
  }

  /** Slides to the panel of `key`; ignored while a slide is running. */
  select(key: K): void {
    const previous = this.current();
    if (key === previous || this.busy) return;
    this.current.set(key);
    const from = this.panels.get(previous);
    const to = this.panels.get(key);
    if (!from?.isLoaded || !to?.isLoaded) {
      this.settle();
      return;
    }

    this.busy = true;
    const direction = this.keys.indexOf(key) > this.keys.indexOf(previous) ? 1 : -1;
    const animation = { duration: SLIDE_MS, curve: CoreTypes.AnimationCurve.easeInOut };
    Promise.all([
      from.animate({ translate: { x: -direction * Screen.mainScreen.widthDIPs, y: 0 }, ...animation }),
      to.animate({ translate: { x: 0, y: 0 }, ...animation }),
    ]).catch(() => undefined).finally(() => {
      this.settle();
      this.busy = false;
    });
  }

  /** Class of the tab button of `key`. */
  tabClass(key: K): string {
    return key === this.current() ? 'tab tab-active' : 'tab';
  }

  private settle(): void {
    this.panels.forEach((panel, key) => { panel.translateX = this.restingOffset(key); });
  }

  /** The active panel is in place; the others wait out of sight on their own side. */
  private restingOffset(key: K): number {
    return Math.sign(this.keys.indexOf(key) - this.keys.indexOf(this.current())) * Screen.mainScreen.widthDIPs;
  }
}
