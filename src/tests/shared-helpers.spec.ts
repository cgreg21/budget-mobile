import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListReveal } from '~/app/shared/list-reveal';
import { TabPager } from '~/app/shared/tab-pager';
import { ScrollView, Screen, View } from './stubs/nativescript-core';

const WIDTH = Screen.mainScreen.widthDIPs;

describe('TabPager', () => {
  let pager: TabPager<'a' | 'b' | 'c'>;
  let a: View;
  let b: View;
  let c: View;

  beforeEach(() => {
    pager = new TabPager(['a', 'b', 'c'] as const);
    a = new View();
    b = new View();
    c = new View();
    pager.register('a', a as never);
    pager.register('b', b as never);
    pager.register('c', c as never);
  });

  it('parks the panels on their side of the active one', () => {
    expect(a.translateX).toBe(0);
    expect(b.translateX).toBe(WIDTH);
    expect(c.translateX).toBe(WIDTH);
    expect(pager.tabClass('a')).toBe('tab tab-active');
    expect(pager.tabClass('b')).toBe('tab');
  });

  it('slides both panels then settles them, ignoring taps while busy', async () => {
    pager.select('c');
    expect(pager.tabClass('c')).toBe('tab tab-active');
    expect(a.animate).toHaveBeenCalledWith(expect.objectContaining({ translate: { x: -WIDTH, y: 0 } }));
    expect(c.animate).toHaveBeenCalledWith(expect.objectContaining({ translate: { x: 0, y: 0 } }));
    pager.select('b');
    expect(pager.tabClass('b')).toBe('tab');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(a.translateX).toBe(-WIDTH);
    expect(b.translateX).toBe(-WIDTH);
    expect(c.translateX).toBe(0);
    pager.select('a');
    expect(c.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: WIDTH, y: 0 } }));
  });

  it('does nothing when the key is already selected', () => {
    pager.select('a');
    expect(a.animate).not.toHaveBeenCalled();
  });

  it('jumps without animating when a panel is not loaded', () => {
    b.isLoaded = false;
    pager.select('b');
    expect(a.animate).not.toHaveBeenCalled();
    expect(a.translateX).toBe(-WIDTH);
    expect(b.translateX).toBe(0);
  });

  it('settles even when an animation fails', async () => {
    a.animate.mockImplementationOnce(() => Object.assign(Promise.reject(new Error('cancelled')), { cancel: vi.fn() }));
    pager.select('b');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(b.translateX).toBe(0);
    pager.select('a');
    expect(pager.tabClass('a')).toBe('tab tab-active');
  });
});

describe('ListReveal', () => {
  let reveal: ListReveal;
  let scroll: ScrollView;

  const row = (top: number, height = 50, parent: View = scroll): View => {
    const view = new View();
    view.parent = parent;
    view.getActualSize.mockReturnValue({ width: 300, height });
    view.getLocationRelativeTo.mockReturnValue({ x: 0, y: top });
    return view;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    reveal = new ListReveal();
    scroll = new ScrollView();
    scroll.getActualSize.mockReturnValue({ width: 300, height: 400 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores rows outside a ScrollView', () => {
    const orphan = row(0, 50, null as unknown as View);
    reveal.add(orphan as never);
    expect(orphan.opacity).toBe(1);
  });

  it('hides new rows and reveals the visible ones one after the other', () => {
    const inner = new View();
    inner.parent = scroll;
    const rows = [row(0, 50, inner), row(60), row(500)];
    for (const r of rows) reveal.add(r as never);
    for (const r of rows) {
      expect(r.opacity).toBe(0);
      expect(r.translateY).toBe(28);
    }
    vi.advanceTimersByTime(40);
    expect(rows[0].animate).toHaveBeenCalledWith(expect.objectContaining({ opacity: 1, delay: 0 }));
    expect(rows[1].animate).toHaveBeenCalledWith(expect.objectContaining({ delay: 45 }));
    expect(rows[2].animate).not.toHaveBeenCalled();
  });

  it('falls back to the screen height when the scroll view is not measured yet', () => {
    scroll.getActualSize.mockReturnValue({ width: 0, height: 0 });
    const r = row(700);
    reveal.add(r as never);
    vi.advanceTimersByTime(40);
    expect(r.animate).toHaveBeenCalled();
  });

  it('hides rows scrolled out of view and reveals them again without stagger', () => {
    const r = row(100);
    reveal.add(r as never);
    vi.advanceTimersByTime(40);
    const animation = r.animate.mock.results[0].value as { cancel: ReturnType<typeof vi.fn> };

    r.getLocationRelativeTo.mockReturnValue({ x: 0, y: -100 });
    reveal.onScroll({ object: scroll, scrollX: 0, scrollY: 200 } as never);
    expect(r.opacity).toBe(0);
    expect(animation.cancel).toHaveBeenCalled();

    r.getLocationRelativeTo.mockReturnValue({ x: 0, y: 10 });
    reveal.onScroll({ object: scroll, scrollX: 0, scrollY: 0 } as never);
    expect(r.animate).toHaveBeenCalledTimes(2);
    expect(r.animate).toHaveBeenLastCalledWith(expect.objectContaining({ delay: 0 }));
  });

  it('forgets unloaded rows and lists, and scroll events of unknown lists', () => {
    const r = row(0);
    reveal.add(r as never);
    r.isLoaded = false;
    vi.advanceTimersByTime(40);
    expect(r.animate).not.toHaveBeenCalled();

    scroll.isLoaded = false;
    const other = new ScrollView();
    const fresh = row(0, 50, other);
    reveal.add(fresh as never);
    r.isLoaded = true;
    reveal.onScroll({ object: scroll, scrollX: 0, scrollY: 0 } as never);
    expect(r.animate).not.toHaveBeenCalled();
    reveal.onScroll({ object: new ScrollView(), scrollX: 0, scrollY: 0 } as never);
  });

  it('swallows a rejected animation', async () => {
    const r = row(0);
    r.animate.mockImplementationOnce(() => Object.assign(Promise.reject(new Error('gone')), { cancel: vi.fn() }));
    reveal.add(r as never);
    vi.advanceTimersByTime(40);
    await Promise.resolve();
    expect(r.animate).toHaveBeenCalled();
  });
});
