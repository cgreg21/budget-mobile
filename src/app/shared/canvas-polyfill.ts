import { isIOS } from '@nativescript/core';
import { Path } from '@nativescript-community/ui-canvas';

/**
 * On iOS, ui-canvas draws text and line paths through Objective-C helpers compiled from the plugin
 * (`UIDrawingText`, `UIDrawingPath`, the `UIBezierPath (Elements)` category). An app built without
 * them breaks every chart ("UIDrawingText is not defined", lines never drawn). These JavaScript
 * stand-ins use UIKit and CoreGraphics directly and are only installed for the helpers that are
 * missing, so a native build keeps its own.
 */
export function installCanvasPolyfills(): void {
  if (!isIOS) return;
  const scope = globalThis as unknown as Record<string, unknown>;
  if (typeof scope.UIDrawingText === 'undefined') scope.UIDrawingText = drawingText();
  if (typeof scope.UIDrawingPath === 'undefined') scope.UIDrawingPath = drawingPath();

  const bezier = UIBezierPath as unknown as Record<string, unknown>;
  const path = Path.prototype as unknown as Record<string, unknown>;
  if (typeof bezier.addLinesOffsetCountCloseToPath !== 'function') path.addLines = addLines;
  if (typeof bezier.addCubicLinesOffsetCountCloseToPath !== 'function') path.addCubicLines = addCubicLines;
}

type Points = ArrayLike<number>;
type Attributes = NSDictionary<string, unknown>;
type CanvasPath = { getCGPath(): unknown; getBPath(): UIBezierPath | undefined };

const USES_DEVICE_METRICS = 8 as NSStringDrawingOptions;

const reported = new Set<string>();

/** A text that fails to measure or draw must not abort the whole chart drawing: it is skipped instead. */
function safely<A extends unknown[], R>(name: string, fallback: R, run: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    try {
      return run(...args);
    } catch (error) {
      if (!reported.has(name)) {
        reported.add(name);
        console.log(`canvas-polyfill: ${name} failed: ${error}`);
      }
      return fallback;
    }
  };
}

function drawingText() {
  const attributed = (text: unknown, attributes: Attributes): NSAttributedString =>
    NSAttributedString.alloc().initWithStringAttributes(String(text ?? ''), attributes);
  const part = (text: unknown, from?: number, to?: number): string => String(text ?? '').substring(from ?? 0, to);
  const fontAndColor = (font: UIFont, color: UIColor): Attributes => {
    const attributes = NSMutableDictionary.new() as NSMutableDictionary<string, unknown>;
    if (font) attributes.setObjectForKey(font, NSFontAttributeName);
    if (color) attributes.setObjectForKey(color, NSForegroundColorAttributeName);
    return attributes;
  };

  return {
    measureTextFromToAttributes: safely('measureText', 0, (text: unknown, from: number, to: number, attributes: Attributes): number =>
      attributed(part(text, from, to), attributes).size().width,
    ),
    getTextBoundsFromToAttributes: safely(
      'getTextBounds',
      CGRectMake(0, 0, 0, 0),
      (text: unknown, from: number, to: number, attributes: Attributes): CGRect => {
        const { size } = attributed(part(text, from, to), attributes).boundingRectWithSizeOptionsContext(
          CGSizeMake(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
          USES_DEVICE_METRICS,
          null,
        );
        // Same convention as the native helper: the box sits above the baseline.
        return CGRectMake(0, -size.height, size.width, size.height);
      },
    ),
    drawStringXYWithAttributes: safely('drawText', undefined, (text: unknown, x: number, y: number, attributes: Attributes): void =>
      attributed(text, attributes).drawAtPoint(CGPointMake(x, y)),
    ),
    drawStringXYFontColor: safely('drawText', undefined, (text: unknown, x: number, y: number, font: UIFont, color: UIColor): void =>
      attributed(text, fontAndColor(font, color)).drawAtPoint(CGPointMake(x, y)),
    ),
    drawAttributedStringXYFontColor: safely(
      'drawText',
      undefined,
      (text: NSAttributedString, x: number, y: number, font: UIFont, color: UIColor): void => {
        const styled = NSMutableAttributedString.alloc().initWithAttributedString(text);
        styled.addAttributesRange(fontAndColor(font, color), { location: 0, length: styled.length });
        styled.drawAtPoint(CGPointMake(x, y));
      },
    ),
  };
}

function drawingPath() {
  return {
    /** Strokes the polyline through the `count / 2` points, like the native helper. */
    drawLineSegmentsCountInContextWithTransform: (points: Points, count: number, context: unknown, transform?: CGAffineTransform): void => {
      if (count < 4) return;
      const at = (index: number): [number, number] => {
        const x = points[index];
        const y = points[index + 1];
        if (!transform) return [x, y];
        return [transform.a * x + transform.c * y + transform.tx, transform.b * x + transform.d * y + transform.ty];
      };
      CGContextBeginPath(context);
      const [startX, startY] = at(0);
      CGContextMoveToPoint(context, startX, startY);
      for (let index = 2; index + 1 < count; index += 2) {
        const [x, y] = at(index);
        CGContextAddLineToPoint(context, x, y);
      }
      CGContextStrokePath(context);
    },
  };
}

/** `Path.addLines`: a polyline from `points[offset]` up to the index `count` (exclusive). */
function addLines(this: CanvasPath, points: Points, offset = 0, count = points.length, close = false): void {
  if (count - offset < 2) return;
  const bezier = this.getBPath();
  if (bezier) {
    bezier.moveToPoint(CGPointMake(points[offset], points[offset + 1]));
    for (let index = offset + 2; index + 1 < count; index += 2) bezier.addLineToPoint(CGPointMake(points[index], points[index + 1]));
    if (close) bezier.closePath();
    return;
  }
  const target = this.getCGPath();
  CGPathMoveToPoint(target, null, points[offset], points[offset + 1]);
  for (let index = offset + 2; index + 1 < count; index += 2) CGPathAddLineToPoint(target, null, points[index], points[index + 1]);
  if (close) CGPathCloseSubpath(target);
}

/** `Path.addCubicLines`: a start point then, every 6 values, two control points and an end point. */
function addCubicLines(this: CanvasPath, points: Points, offset = 0, count = points.length, close = false): void {
  if (count - offset < 2) return;
  const bezier = this.getBPath();
  if (bezier) {
    bezier.moveToPoint(CGPointMake(points[offset], points[offset + 1]));
    for (let index = offset + 2; index + 5 < count; index += 6) {
      bezier.addCurveToPointControlPoint1ControlPoint2(
        CGPointMake(points[index + 4], points[index + 5]),
        CGPointMake(points[index], points[index + 1]),
        CGPointMake(points[index + 2], points[index + 3]),
      );
    }
    if (close) bezier.closePath();
    return;
  }
  const target = this.getCGPath();
  CGPathMoveToPoint(target, null, points[offset], points[offset + 1]);
  for (let index = offset + 2; index + 5 < count; index += 6) {
    CGPathAddCurveToPoint(
      target, null,
      points[index], points[index + 1],
      points[index + 2], points[index + 3],
      points[index + 4], points[index + 5],
    );
  }
  if (close) CGPathCloseSubpath(target);
}
