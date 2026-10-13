/* Stand-in for the `@nativescript-community/ui-chart*`, `ui-canvas` and `nativescript-ui-sidedrawer` plugins. */
import { NgModule } from '@angular/core';
import { vi } from 'vitest';

export class Path {
  ops: string[] = [];
  moveTo(x: number, y: number): void { this.ops.push(`M${x},${y}`); }
  lineTo(x: number, y: number): void { this.ops.push(`L${x},${y}`); }
  cubicTo(...p: number[]): void { this.ops.push(`C${p.join(',')}`); }
  quadTo(...p: number[]): void { this.ops.push(`Q${p.join(',')}`); }
  close(): void { this.ops.push('Z'); }
  reset(): void { this.ops = []; }
}

class ChartBase {
  data: unknown = null;
  invalidate = vi.fn();
  notifyDataSetChanged = vi.fn();
  animateX = vi.fn();
  animateY = vi.fn();
  setExtraOffsets = vi.fn();
  highlightValues = vi.fn();
  xAxis = { position: 0, enabled: true, drawGridLines: false, labelCount: 0, textColor: '', textSize: 0, valueFormatter: null as unknown };
  leftAxis = { enabled: true, drawGridLines: false, textColor: '', textSize: 0, gridColor: '', axisMinimum: 0 };
  rightAxis = { enabled: true, drawGridLines: false };
  legend = { enabled: true, textColor: '', textSize: 0 };
}
export class LineChart extends ChartBase {}
export class PieChart extends ChartBase {
  holeRadius = 0;
  transparentCircleRadius = 0;
  drawEntryLabels = true;
  drawHoleEnabled = true;
  holeColor = '';
  centerText = '';
}
export class LineData { constructor(public dataSets: unknown[] = []) {} }
export class LineDataSet { constructor(public values: unknown[] = [], public label = '', public xProperty?: string, public yProperty?: string) {} }
export class PieData { constructor(public dataSets: unknown[] = []) {} }
export class PieDataSet { constructor(public values: unknown[] = [], public label = '', public yProperty?: string) {} }
export const XAxisPosition = { TOP: 0, BOTTOM: 1, BOTH_SIDED: 2, TOP_INSIDE: 3, BOTTOM_INSIDE: 4 };
export const install = vi.fn();

export class SlideInOnTopTransition {}
export class RadSideDrawer {
  gesturesEnabled = true;
  showDrawer = vi.fn();
  closeDrawer = vi.fn();
  toggleDrawerState = vi.fn();
  getIsOpen = vi.fn(() => false);
}
@NgModule({})
export class NativeScriptUISideDrawerModule {}
