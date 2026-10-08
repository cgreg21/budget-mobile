import { Directive, ElementRef, HostListener, inject, input, numberAttribute } from '@angular/core';
import { CoreTypes, type TouchGestureEventData, type View } from '@nativescript/core';

const APPEAR_MS = 320;
const SOFT_MS = 200;
const RISE_OFFSET = 18;
const POP_SCALE = 0.6;
const SOFT_SCALE = 0.96;
const PRESS_SCALE = 0.93;
const PRESS_MS = 90;
const RELEASE_MS = 150;

/**
 * Plays an entrance animation when the element is first shown: it fades in while rising
 * (`rise`, the default), growing with a spring (`pop`) or growing very slightly (`soft`, for
 * large panels where `pop` would be too strong). The value of the attribute is a delay in
 * milliseconds, which lets sibling elements appear one after the other.
 *
 *     <StackLayout [nsAppear]="80"></StackLayout>
 *     <Button nsAppear="300" nsAppearMode="pop"></Button>
 */
@Directive({ selector: '[nsAppear]' })
export class AppearDirective {
  readonly delay = input(0, { alias: 'nsAppear', transform: (value: unknown) => numberAttribute(value, 0) });
  readonly mode = input<'rise' | 'pop' | 'soft'>('rise', { alias: 'nsAppearMode' });
  private readonly view = inject<ElementRef<View>>(ElementRef).nativeElement;

  @HostListener('loaded')
  onLoaded(): void {
    const view = this.view;
    const mode = this.mode();
    view.opacity = 0;
    if (mode === 'rise') {
      view.translateY = RISE_OFFSET;
    } else {
      const scale = mode === 'pop' ? POP_SCALE : SOFT_SCALE;
      view.scaleX = scale;
      view.scaleY = scale;
    }
    view.animate({
      opacity: 1,
      translate: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      duration: mode === 'soft' ? SOFT_MS : APPEAR_MS,
      delay: this.delay(),
      curve: mode === 'pop' ? CoreTypes.AnimationCurve.spring : CoreTypes.AnimationCurve.easeOut,
    }).catch(() => undefined);
  }
}

/** Shrinks the element slightly while it is pressed, so taps feel physical. */
@Directive({ selector: '[nsPress]' })
export class PressDirective {
  private readonly view = inject<ElementRef<View>>(ElementRef).nativeElement;

  @HostListener('touch', ['$event'])
  onTouch(event: Event): void {
    const args = event as unknown as TouchGestureEventData;
    if (args.action === 'down') {
      this.scaleTo(PRESS_SCALE, PRESS_MS);
    } else if (args.action === 'up' || args.action === 'cancel') {
      this.scaleTo(1, RELEASE_MS);
    }
  }

  private scaleTo(scale: number, duration: number): void {
    if (!this.view.isLoaded) return;
    this.view.animate({
      scale: { x: scale, y: scale },
      duration,
      curve: CoreTypes.AnimationCurve.easeOut,
    }).catch(() => undefined);
  }
}
