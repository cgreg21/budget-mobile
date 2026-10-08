import { Component, NO_ERRORS_SCHEMA, computed, effect, inject, input } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import type { PieChart } from '@nativescript-community/ui-chart/charts/PieChart';
import { PieData } from '@nativescript-community/ui-chart/data/PieData';
import { PieDataSet } from '@nativescript-community/ui-chart/data/PieDataSet';
import type { PieSlice } from 'budget-lib';

import { isLightTheme, SettingsService } from '../../../core/settings.service';
import { installCanvasPolyfills } from '../../../shared/canvas-polyfill';

// Idempotent; also done here because a hot reload skips main.ts. Without it the percentages cannot be drawn.
installCanvasPolyfills();

/** Slices thinner than this get no percentage written on them. */
const MIN_LABELLED_FRACTION = 0.06;

const formatPercent = (fraction: number): string => (fraction < 0.01 ? '<1%' : `${Math.round(fraction * 100)}%`);

/** A pie chart of amounts per category, with its legend (color, name, amount, share). */
@Component({
  selector: 'ns-category-pie',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './category-pie.component.html',
})
export class CategoryPieComponent {
  readonly slices = input.required<PieSlice[]>();
  readonly kind = input<'income' | 'expense'>('expense');
  readonly title = input('');
  readonly s = inject(SettingsService);

  readonly legend = computed(() => this.slices().map((slice) => ({
    label: slice.label,
    icon: slice.icon ?? '',
    color: slice.color,
    amount: this.s.formatAmount(slice.amount),
    percent: formatPercent(slice.fraction),
    // The filled part of the bar is the slice's share of the total.
    columns: `${slice.fraction * 100}*, ${(1 - slice.fraction) * 100}*`,
  })));

  private chart: PieChart | null = null;

  constructor() {
    effect(() => {
      this.slices();
      this.render();
    });
  }

  onLoaded(chart: PieChart): void {
    chart.description.enabled = false;
    chart.legend.enabled = false;
    chart.drawHoleEnabled = true;
    chart.holeRadius = 58;
    chart.transparentCircleRadiusPercent = 0;
    // The hole is painted, not cut: it must match the page background.
    chart.holeColor = isLightTheme() ? '#f4f6fb' : '#0a0f1e';
    chart.drawEntryLabels = false;
    chart.rotationEnabled = false;
    chart.highlightPerTapEnabled = false;
    this.chart = chart;
    this.render();
    chart.animateY(600);
  }

  private render(): void {
    const chart = this.chart;
    const slices = this.slices();
    if (!chart || slices.length === 0) return;

    const entries = slices.map((slice) => ({
      y: slice.amount,
      label: slice.label,
      percent: slice.fraction >= MIN_LABELLED_FRACTION ? formatPercent(slice.fraction) : '',
    }));
    const dataSet = new PieDataSet(entries, '');
    dataSet.colors = slices.map((slice) => slice.color);
    dataSet.sliceSpace = 2;
    dataSet.drawValuesEnabled = true;

    const data = new PieData([dataSet]);
    data.valueTextSize = 12;
    data.valueTextColor = '#0A0F1E';
    data.valueFormatter = { getFormattedValue: (_value: number, entry: { percent?: string }) => entry.percent ?? '' } as any;
    chart.data = data;
    chart.invalidate();
  }
}
