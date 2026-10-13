import { Path } from '@nativescript-community/ui-canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCanvasPolyfills } from '~/app/shared/canvas-polyfill';
import { setPlatform } from './stubs/nativescript-core';

const scope = globalThis as unknown as Record<string, any>;

type DrawingText = {
  measureTextFromToAttributes(text: unknown, from: number, to: number, attributes: unknown): number;
  getTextBoundsFromToAttributes(text: unknown, from: number, to: number, attributes: unknown): { x: number; y: number; w: number; h: number };
  drawStringXYWithAttributes(text: unknown, x: number, y: number, attributes: unknown): void;
  drawStringXYFontColor(text: unknown, x: number, y: number, font: unknown, color: unknown): void;
  drawAttributedStringXYFontColor(text: unknown, x: number, y: number, font: unknown, color: unknown): void;
};
type DrawingPath = {
  drawLineSegmentsCountInContextWithTransform(points: ArrayLike<number>, count: number, context: unknown, transform?: unknown): void;
};

/** A string drawn with attributes; its size follows its length so the tests can check the slicing. */
class FakeAttributedString {
  drawn: { x: number; y: number }[] = [];
  attributes: Record<string, unknown> = {};
  constructor(public text: string, attributes?: unknown) {
    if (attributes instanceof Map) this.attributes = Object.fromEntries(attributes);
  }
  get length(): number { return this.text.length; }
  size() { return { width: this.text.length * 10, height: 12 }; }
  boundingRectWithSizeOptionsContext() { return { size: this.size() }; }
  drawAtPoint(point: { x: number; y: number }) { this.drawn.push(point); }
  addAttributesRange(attributes: Map<string, unknown>) { this.attributes = Object.fromEntries(attributes); }
}

const GLOBALS = [
  'UIBezierPath', 'NSAttributedString', 'NSMutableAttributedString', 'NSMutableDictionary', 'NSFontAttributeName',
  'NSForegroundColorAttributeName', 'CGRectMake', 'CGSizeMake', 'CGPointMake', 'CGContextBeginPath', 'CGContextMoveToPoint',
  'CGContextAddLineToPoint', 'CGContextStrokePath', 'CGPathMoveToPoint', 'CGPathAddLineToPoint', 'CGPathCloseSubpath',
  'CGPathAddCurveToPoint', 'UIDrawingText', 'UIDrawingPath',
];

describe('installCanvasPolyfills', () => {
  const calls: string[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(',')})`); };
  let lastAttributed: FakeAttributedString | null;

  beforeEach(() => {
    calls.length = 0;
    lastAttributed = null;
    setPlatform('ios');
    Object.assign(scope, {
      UIBezierPath: {},
      NSAttributedString: { alloc: () => ({ initWithStringAttributes: (text: string, attributes: unknown) => (lastAttributed = new FakeAttributedString(text, attributes)) }) },
      NSMutableAttributedString: { alloc: () => ({ initWithAttributedString: (text: FakeAttributedString) => (lastAttributed = new FakeAttributedString(text.text)) }) },
      NSMutableDictionary: { new: () => { const map = new Map(); return Object.assign(map, { setObjectForKey: (value: unknown, key: string) => map.set(key, value) }); } },
      NSFontAttributeName: 'font',
      NSForegroundColorAttributeName: 'color',
      CGRectMake: (x: number, y: number, w: number, h: number) => ({ x, y, w, h }),
      CGSizeMake: (width: number, height: number) => ({ width, height }),
      CGPointMake: (x: number, y: number) => ({ x, y }),
      CGContextBeginPath: record('begin'),
      CGContextMoveToPoint: record('move'),
      CGContextAddLineToPoint: record('line'),
      CGContextStrokePath: record('stroke'),
      CGPathMoveToPoint: record('pmove'),
      CGPathAddLineToPoint: record('pline'),
      CGPathCloseSubpath: record('pclose'),
      CGPathAddCurveToPoint: record('pcurve'),
    });
  });

  afterEach(() => {
    for (const key of GLOBALS) delete scope[key];
    delete (Path.prototype as unknown as Record<string, unknown>)['addLines'];
    delete (Path.prototype as unknown as Record<string, unknown>)['addCubicLines'];
  });

  it('does nothing outside iOS', () => {
    setPlatform('android');
    installCanvasPolyfills();
    expect(scope.UIDrawingText).toBeUndefined();
    expect((Path.prototype as unknown as Record<string, unknown>)['addLines']).toBeUndefined();
  });

  it('keeps native helpers when they exist', () => {
    scope.UIDrawingText = 'native';
    scope.UIDrawingPath = 'native';
    scope.UIBezierPath = { addLinesOffsetCountCloseToPath: () => undefined, addCubicLinesOffsetCountCloseToPath: () => undefined };
    installCanvasPolyfills();
    expect(scope.UIDrawingText).toBe('native');
    expect(scope.UIDrawingPath).toBe('native');
    expect((Path.prototype as unknown as Record<string, unknown>)['addLines']).toBeUndefined();
  });

  describe('text', () => {
    let text: DrawingText;
    beforeEach(() => {
      installCanvasPolyfills();
      text = scope.UIDrawingText as DrawingText;
    });

    it('measures and bounds a part of the text', () => {
      expect(text.measureTextFromToAttributes('hello world', 0, 5, {})).toBe(50);
      expect(text.measureTextFromToAttributes(null, undefined as never, undefined as never, {})).toBe(0);
      expect(text.getTextBoundsFromToAttributes('hello', 1, 3, {})).toEqual({ x: 0, y: -12, w: 20, h: 12 });
    });

    it('draws strings with attributes, a font and a colour', () => {
      text.drawStringXYWithAttributes('a', 1, 2, {});
      expect(lastAttributed!.drawn).toEqual([{ x: 1, y: 2 }]);
      text.drawStringXYFontColor(42, 3, 4, 'F', 'C');
      expect(lastAttributed!.text).toBe('42');
      expect(lastAttributed!.attributes).toEqual({ font: 'F', color: 'C' });
      text.drawStringXYFontColor('b', 0, 0, null, null);
      expect(lastAttributed!.attributes).toEqual({});
      text.drawAttributedStringXYFontColor(new FakeAttributedString('rich') as never, 5, 6, 'F', 'C');
      expect(lastAttributed!.text).toBe('rich');
      expect(lastAttributed!.attributes).toEqual({ font: 'F', color: 'C' });
      expect(lastAttributed!.drawn).toEqual([{ x: 5, y: 6 }]);
    });

    it('skips a text that fails, reporting it once', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      scope.NSAttributedString = { alloc: () => { throw new Error('boom'); } };
      expect(text.measureTextFromToAttributes('x', 0, 1, {})).toBe(0);
      expect(text.getTextBoundsFromToAttributes('x', 0, 1, {})).toEqual({ x: 0, y: 0, w: 0, h: 0 });
      expect(text.drawStringXYWithAttributes('x', 0, 0, {})).toBeUndefined();
      expect(text.drawStringXYWithAttributes('x', 0, 0, {})).toBeUndefined();
      expect(log).toHaveBeenCalledTimes(3);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('measureText failed'));
      log.mockRestore();
    });
  });

  describe('paths', () => {
    beforeEach(() => installCanvasPolyfills());

    it('strokes line segments, optionally transformed', () => {
      const path = scope.UIDrawingPath as DrawingPath;
      path.drawLineSegmentsCountInContextWithTransform([0, 0], 2, 'ctx');
      expect(calls).toEqual([]);
      path.drawLineSegmentsCountInContextWithTransform([0, 0, 1, 1, 2, 2], 6, 'ctx');
      expect(calls).toEqual(['begin(ctx)', 'move(ctx,0,0)', 'line(ctx,1,1)', 'line(ctx,2,2)', 'stroke(ctx)']);
      calls.length = 0;
      path.drawLineSegmentsCountInContextWithTransform([1, 1, 2, 2], 4, 'ctx', { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 });
      expect(calls).toEqual(['begin(ctx)', 'move(ctx,12,22)', 'line(ctx,14,24)', 'stroke(ctx)']);
    });

    it('adds lines to a bezier path or a CGPath', () => {
      const bezier = { moveToPoint: vi.fn(), addLineToPoint: vi.fn(), closePath: vi.fn(), addCurveToPointControlPoint1ControlPoint2: vi.fn() };
      const withBezier = Object.assign(new Path(), { getBPath: () => bezier, getCGPath: () => 'cg' }) as unknown as { addLines: Function; addCubicLines: Function };
      withBezier.addLines([0]);
      withBezier.addLines([0, 0, 1, 1, 2, 2], 0, 6, true);
      expect(bezier.moveToPoint).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(bezier.addLineToPoint.mock.calls).toEqual([[{ x: 1, y: 1 }], [{ x: 2, y: 2 }]]);
      expect(bezier.closePath).toHaveBeenCalledTimes(1);
      withBezier.addLines([9, 9, 0, 0, 1, 1], 2);
      expect(bezier.moveToPoint).toHaveBeenLastCalledWith({ x: 0, y: 0 });
      expect(bezier.closePath).toHaveBeenCalledTimes(1);

      const withCg = Object.assign(new Path(), { getBPath: () => undefined, getCGPath: () => 'cg' }) as unknown as { addLines: Function; addCubicLines: Function };
      withCg.addLines([0, 0, 1, 1], 0, 4, true);
      withCg.addLines([0, 0, 1, 1]);
      expect(calls).toEqual(['pmove(cg,null,0,0)', 'pline(cg,null,1,1)', 'pclose(cg)', 'pmove(cg,null,0,0)', 'pline(cg,null,1,1)']);
    });

    it('adds cubic lines to a bezier path or a CGPath', () => {
      const bezier = { moveToPoint: vi.fn(), addLineToPoint: vi.fn(), closePath: vi.fn(), addCurveToPointControlPoint1ControlPoint2: vi.fn() };
      const withBezier = Object.assign(new Path(), { getBPath: () => bezier, getCGPath: () => 'cg' }) as unknown as { addCubicLines: Function };
      withBezier.addCubicLines([0]);
      withBezier.addCubicLines([0, 0, 1, 1, 2, 2, 3, 3], 0, 8, true);
      expect(bezier.moveToPoint).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(bezier.addCurveToPointControlPoint1ControlPoint2).toHaveBeenCalledWith({ x: 3, y: 3 }, { x: 1, y: 1 }, { x: 2, y: 2 });
      expect(bezier.closePath).toHaveBeenCalledTimes(1);
      withBezier.addCubicLines([0, 0, 1, 1, 2, 2, 3, 3]);
      expect(bezier.closePath).toHaveBeenCalledTimes(1);

      const withCg = Object.assign(new Path(), { getBPath: () => undefined, getCGPath: () => 'cg' }) as unknown as { addCubicLines: Function };
      withCg.addCubicLines([0, 0, 1, 1, 2, 2, 3, 3], 0, 8, true);
      withCg.addCubicLines([0, 0, 1, 1, 2, 2, 3, 3]);
      expect(calls).toEqual(['pmove(cg,null,0,0)', 'pcurve(cg,null,1,1,2,2,3,3)', 'pclose(cg)', 'pmove(cg,null,0,0)', 'pcurve(cg,null,1,1,2,2,3,3)']);
    });
  });
});
