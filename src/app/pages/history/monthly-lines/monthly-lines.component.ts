import { Component, NO_ERRORS_SCHEMA, effect, inject, input } from '@angular/core';
import { NativeScriptCommonModule, registerElement } from '@nativescript/angular';
import { LineChart } from '@nativescript-community/ui-chart/charts/LineChart';
import { LineData } from '@nativescript-community/ui-chart/data/LineData';
import { LineDataSet } from '@nativescript-community/ui-chart/data/LineDataSet';
import { XAxisPosition } from '@nativescript-community/ui-chart/components/XAxis';
import { monthNumberOf, yearOf, type MonthKey } from 'budget-lib';

import type { MonthlyTotals } from '../../../core/budget.service';
import { isLightTheme, SettingsService } from '../../../core/settings.service';
import { installCanvasPolyfills } from '../../../shared/canvas-polyfill';

// Both are idempotent. Doing them here too keeps the chart working after a hot reload, which skips main.ts.
installCanvasPolyfills();
registerElement('LineChart', () => LineChart);

const INCOME_COLOR = '#00E5A0';
const EXPENSE_COLOR = '#FF6B6B';

/** From this many months on, the month labels are tilted to stay readable. */
const TILT_LABELS_FROM = 7;

const compactAmount = (value: number): string => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : `${Math.round(value)}`);

/** Three letters per month, four when two months would read the same (Juin / Juillet). */
const shortMonths = (names: string[]): string[] =>
  names.map((name) => {
    const short = name.slice(0, 3);
    return names.filter((other) => other.slice(0, 3) === short).length > 1 ? name.slice(0, 4) : short;
  });

/** A line chart (ui-chart) with, for each month, the total income and the total expenses. */
@Component({
  selector: 'ns-monthly-lines',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './monthly-lines.component.html',
})
export class MonthlyLinesComponent {
  readonly rows = input.required<MonthlyTotals[]>();
  private readonly s = inject(SettingsService);

  private chart: LineChart | null = null;

  constructor() {
    effect(() => {
      this.rows();
      this.s.t();
      this.render();
    });
  }

  onLoaded(chart: LineChart): void {
    const light = isLightTheme();
    const textColor = light ? '#5b6b85' : '#7a8ba6';
    const gridColor = light ? '#dde3ee' : '#1e2d45';

    // The chart must always get its data: a failing cosmetic setting must not leave it blank.
    const attempt = (step: string, apply: () => void): void => {
      try {
        apply();
      } catch (error) {
        console.log(`monthly-lines: ${step} failed: ${error}`);
      }
    };

    attempt('options', () => {
      chart.description.enabled = false;
      chart.dragEnabled = false;
      chart.scaleEnabled = false;
      chart.pinchZoomEnabled = false;
      chart.doubleTapToZoomEnabled = false;
      chart.highlightPerTapEnabled = false;
      chart.drawGridBackgroundEnabled = false;
      chart.axisRight.enabled = false;
    });
    attempt('left axis', () => {
      const left = chart.axisLeft;
      left.axisMinimum = 0;
      left.textColor = textColor;
      left.gridColor = gridColor;
      left.drawAxisLine = false;
      left.valueFormatter = { getAxisLabel: (value: number) => compactAmount(value) } as any;
    });
    attempt('x axis', () => {
      const x = chart.xAxis;
      x.position = XAxisPosition.BOTTOM;
      x.textColor = textColor;
      x.drawGridLines = false;
      x.granularity = 1;
      x.axisLineColor = gridColor;
    });
    attempt('legend', () => {
      chart.legend.textColor = textColor;
      chart.legend.textSize = 12;
    });

    this.chart = chart;
    this.render();
    attempt('animation', () => chart.animateX(600));
  }

  private render(): void {
    const chart = this.chart;
    const rows = this.rows();
    if (!chart || rows.length === 0) return;
    try {
      this.draw(chart, rows);
    } catch (error) {
      console.log(`monthly-lines: render failed: ${error}`);
    }
  }

  private draw(chart: LineChart, rows: MonthlyTotals[]): void {
    const t = this.s.t();
    const months = shortMonths(t.months);
    const labelOf = (month: MonthKey): string => `${months[monthNumberOf(month) - 1]} ${String(yearOf(month)).slice(2)}`;

    const makeSet = (values: number[], label: string, color: string): LineDataSet => {
      const set = new LineDataSet(values.map((y, x) => ({ x, y })), label);
      set.color = color;
      set.lineWidth = 2.5;
      set.circleColors = [color];
      set.circleRadius = 4;
      set.drawCircleHoleEnabled = false;
      set.drawValuesEnabled = false;
      return set;
    };

    const data = new LineData([
      makeSet(rows.map((row) => row.income), t.common.income, INCOME_COLOR),
      makeSet(rows.map((row) => row.expense), t.common.expense, EXPENSE_COLOR),
    ]);

    const x = chart.xAxis;
    // Half a unit of margin on each side keeps the first and last points off the edges.
    x.axisMinimum = -0.5;
    x.axisMaximum = rows.length - 0.5;
    x.labelCount = Math.min(rows.length, 12);
    x.labelRotationAngle = rows.length >= TILT_LABELS_FROM ? -45 : 0;
    x.valueFormatter = {
      getAxisLabel: (value: number) => {
        const row = rows[Math.round(value)];
        return row ? labelOf(row.month) : '';
      },
    } as any;

    chart.data = data;
    chart.notifyDataSetChanged();
    chart.invalidate();
  }
}
