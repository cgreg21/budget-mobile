import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AppearDirective, PressDirective } from '~/app/shared/motion';

type AnimatedElement = HTMLElement & { animate: ReturnType<typeof vi.fn>; isLoaded?: boolean; opacity?: number; translateY?: number; scaleX?: number; scaleY?: number };

@Component({
  imports: [AppearDirective, PressDirective],
  template: `
    <div id="rise" [nsAppear]="delay()"></div>
    <div id="pop" nsAppear="300" nsAppearMode="pop"></div>
    <div id="soft" nsAppear nsAppearMode="soft"></div>
    <div id="press" nsPress></div>
  `,
})
class Host {
  readonly delay = signal(80);
}

const setup = (rejecting = false) => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = (id: string): AnimatedElement => {
    const el = fixture.nativeElement.querySelector(`#${id}`) as AnimatedElement;
    el.animate = vi.fn(() => (rejecting ? Promise.reject(new Error('cancelled')) : Promise.resolve())) as never;
    return el;
  };
  return { fixture, element };
};

describe('AppearDirective', () => {
  it('rises in with the given delay', () => {
    const { element } = setup();
    const rise = element('rise');
    rise.dispatchEvent(new Event('loaded'));
    expect(rise.opacity).toBe(0);
    expect(rise.translateY).toBe(18);
    expect(rise.animate).toHaveBeenCalledWith(expect.objectContaining({ opacity: 1, delay: 80, duration: 320, curve: 'easeOut' }));
  });

  it('pops or grows softly', () => {
    const { element } = setup();
    const pop = element('pop');
    pop.dispatchEvent(new Event('loaded'));
    expect(pop.scaleX).toBe(0.6);
    expect(pop.scaleY).toBe(0.6);
    expect(pop.animate).toHaveBeenCalledWith(expect.objectContaining({ delay: 300, duration: 320, curve: 'spring' }));

    const soft = element('soft');
    soft.dispatchEvent(new Event('loaded'));
    expect(soft.scaleX).toBe(0.96);
    expect(soft.animate).toHaveBeenCalledWith(expect.objectContaining({ delay: 0, duration: 200, curve: 'easeOut' }));
  });

  it('ignores a cancelled animation', async () => {
    const { element } = setup(true);
    const rise = element('rise');
    rise.dispatchEvent(new Event('loaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rise.animate).toHaveBeenCalledTimes(1);
  });
});

describe('PressDirective', () => {
  const touch = (action: string): Event => Object.assign(new Event('touch'), { action });

  it('shrinks while pressed and grows back on release or cancel', () => {
    const { element } = setup();
    const press = element('press');
    press.isLoaded = true;
    press.dispatchEvent(touch('down'));
    expect(press.animate).toHaveBeenLastCalledWith(expect.objectContaining({ scale: { x: 0.93, y: 0.93 }, duration: 90 }));
    press.dispatchEvent(touch('move'));
    expect(press.animate).toHaveBeenCalledTimes(1);
    press.dispatchEvent(touch('up'));
    expect(press.animate).toHaveBeenLastCalledWith(expect.objectContaining({ scale: { x: 1, y: 1 }, duration: 150 }));
    press.dispatchEvent(touch('cancel'));
    expect(press.animate).toHaveBeenCalledTimes(3);
  });

  it('does nothing once the element is unloaded, and survives a failed animation', async () => {
    const { element } = setup(true);
    const press = element('press');
    press.isLoaded = false;
    press.dispatchEvent(touch('down'));
    expect(press.animate).not.toHaveBeenCalled();
    press.isLoaded = true;
    press.dispatchEvent(touch('down'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(press.animate).toHaveBeenCalledTimes(1);
  });
});
