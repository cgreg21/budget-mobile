import { TestBed } from '@angular/core/testing';
import { ModalDialogService, RouterExtensions } from '@nativescript/angular';
import { ConfigFileError, DEFAULT_CATEGORY_ICON, emptyConfigData } from 'budget-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankService } from '~/app/core/bank/bank.service';
import { BudgetService, type MonthlyTotals } from '~/app/core/budget.service';
import { CalendarSyncService } from '~/app/core/calendar-sync.service';
import { ConfigArchiveService } from '~/app/core/config-archive.service';
import { SettingsService } from '~/app/core/settings.service';
import { CategoriesPage } from '~/app/pages/categories/categories.page';
import { HistoryPage } from '~/app/pages/history/history.page';
import { MonthlyLinesComponent } from '~/app/pages/history/monthly-lines/monthly-lines.component';
import { BankPage } from '~/app/pages/settings/bank/bank.page';
import { RecurrencesPage } from '~/app/pages/settings/recurrences/recurrences.page';
import { SettingsPage } from '~/app/pages/settings/settings.page';
import { CategoryPieComponent } from '~/app/pages/stats/category-pie/category-pie.component';
import { StatsPage } from '~/app/pages/stats/stats.page';
import { createComponent, currentPage, prepareComponents, recurrence, seedDatabase, tx } from './helpers';
import { Dialogs, Http, View, makeRootView, nsState } from './stubs/nativescript-core';
import { secureState } from './stubs/secure-storage';

const SEED = {
  months: {
    '2024-03': [
      tx('a', { amount: 40 }),
      tx('b', { date: '2024-03-02', kind: 'income', category: 'Salaire', amount: 2000 }),
      tx('c', { date: '2024-03-05', category: 'Logement', amount: 500, recurrenceId: 'r1' }),
    ],
    '2024-01': [tx('d', { date: '2024-01-20', category: 'Transport', amount: 60 })],
  },
  recurrences: [recurrence('r1'), recurrence('r2', { occurrences: 3, startMonth: '2024-02', description: '' })],
};

let budget: BudgetService;
let settings: SettingsService;

beforeEach(async () => {
  vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
  nsState.rootView = makeRootView();
  prepareComponents(CategoriesPage, HistoryPage, StatsPage, SettingsPage, RecurrencesPage, BankPage, MonthlyLinesComponent, CategoryPieComponent);
  await seedDatabase(SEED);
  budget = TestBed.inject(BudgetService);
  settings = TestBed.inject(SettingsService);
});

describe('CategoriesPage', () => {
  let page: CategoriesPage;
  beforeEach(() => {
    page = createComponent(CategoriesPage).componentInstance;
  });

  it('adds a category once its name is valid and free', () => {
    const count = budget.categories().length;
    page.add();
    page.newName.set('  Alimentation ');
    page.add();
    expect(page.error()).toMatch(/Alimentation/);
    expect(budget.categories()).toHaveLength(count);
    page.newName.set(' voyages ');
    page.newIcon.set('plane');
    page.add();
    expect(page.error()).toBe('');
    expect(budget.categories().at(-1)).toMatchObject({ name: 'voyages', icon: 'plane' });
    expect(page.newName()).toBe('');
    expect(page.newIcon()).toBe(DEFAULT_CATEGORY_ICON);
  });

  it('renames a category through the dialog', () => {
    const category = budget.categories()[0];
    page.confirmRename();
    page.rename(category);
    expect(page.renaming()).toBe(category);
    expect(page.renameText()).toBe(category.name);
    page.confirmRename();
    expect(page.renaming()).toBeNull();

    page.rename(category);
    page.renameText.set('Logement');
    page.confirmRename();
    expect(page.error()).toMatch(/Logement/);
    expect(page.renaming()).toBe(category);
    page.renameText.set('');
    page.confirmRename();
    expect(page.renaming()).toBe(category);
    page.cancelRename();
    expect(page.error()).toBe('');
    expect(page.renaming()).toBeNull();

    page.rename(category);
    page.renameText.set('Courses');
    page.confirmRename();
    expect(budget.categories()[0].name).toBe('Courses');
  });

  it('picks the icon of the new category or of an existing one', () => {
    expect(page.currentIcon()).toBe('');
    page.pickerTarget.set(page.NEW);
    expect(page.currentIcon()).toBe(DEFAULT_CATEGORY_ICON);
    page.pickIcon('plane');
    expect(page.newIcon()).toBe('plane');
    expect(page.pickerTarget()).toBeNull();

    page.pickerTarget.set('Transport');
    expect(page.currentIcon()).toBe(budget.categories().find((c) => c.name === 'Transport')!.icon);
    page.pickIcon('bus');
    expect(budget.categories().find((c) => c.name === 'Transport')!.icon).toBe('bus');
    page.pickIcon('x');
    expect(page.glyphOf('bus')).toBeTruthy();
    expect(page.choices.length).toBeGreaterThan(0);
  });

  it('focuses the field of a dialog once shown', () => {
    vi.useFakeTimers();
    const field = new View();
    page.focusField(field as never);
    vi.advanceTimersByTime(300);
    expect(field.focus).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('removes a category after confirmation, but never the last one', async () => {
    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValue(true);
    const count = budget.categories().length;
    await page.remove(budget.categories()[1]);
    expect(budget.categories()).toHaveLength(count);
    await page.remove(budget.categories()[1]);
    expect(budget.categories()).toHaveLength(count - 1);
    while (budget.categories().length > 1) await page.remove(budget.categories()[0]);
    await page.remove(budget.categories()[0]);
    expect(Dialogs.alert).toHaveBeenCalledWith(expect.objectContaining({ message: settings.t().categories.mustKeepOne }));
    expect(budget.categories()).toHaveLength(1);
  });
});

describe('HistoryPage', () => {
  it('lists the last six months with their relative bars', () => {
    const page = createComponent(HistoryPage).componentInstance;
    expect(page.start()).toBe('2023-10');
    expect(page.end()).toBe('2024-03');
    const rows = page.rows();
    expect(rows.map((r) => r.month)).toEqual(['2023-10', '2023-11', '2023-12', '2024-01', '2024-02', '2024-03']);
    expect(rows[3]).toEqual({ month: '2024-01', income: 0, expense: 60 });
    const history = page.history();
    expect(history[0]).toMatchObject({ month: '2024-03', columns: '658*, 342*' });
    expect(history[1].columns).toBe('0*, 0*');
    expect(history[2].columns).toBe('0*, 1000*');
  });

  it('opens a month on the budget page', () => {
    const page = createComponent(HistoryPage).componentInstance;
    page.open('2024-01');
    expect(budget.selectedMonth()).toBe('2024-01');
    expect(TestBed.inject(RouterExtensions).navigate).toHaveBeenCalledWith(['/budget'], expect.objectContaining({ clearHistory: true }));
  });

  it('moves either bound of the interval, dragging the other when needed', async () => {
    const page = createComponent(HistoryPage).componentInstance;
    const modal = TestBed.inject(ModalDialogService);
    const pick = (month: string | undefined) => vi.mocked(modal.showModal).mockResolvedValueOnce(month as never);

    pick(undefined);
    await page.choose('start');
    expect(page.start()).toBe('2023-10');

    pick('2024-06');
    await page.choose('start');
    expect([page.start(), page.end()]).toEqual(['2024-06', '2024-06']);
    pick('2020-01');
    await page.choose('start');
    expect([page.start(), page.end()]).toEqual(['2020-01', '2021-12']);
    pick('2021-06');
    await page.choose('start');
    expect([page.start(), page.end()]).toEqual(['2021-06', '2021-12']);

    pick('2021-01');
    await page.choose('end');
    expect([page.start(), page.end()]).toEqual(['2021-01', '2021-01']);
    pick('2025-01');
    await page.choose('end');
    expect([page.start(), page.end()]).toEqual(['2023-02', '2025-01']);
    pick('2024-12');
    await page.choose('end');
    expect([page.start(), page.end()]).toEqual(['2023-02', '2024-12']);
  });
});

describe('MonthlyLinesComponent', () => {
  const rows: MonthlyTotals[] = Array.from({ length: 8 }, (_, i) => ({ month: `2024-0${i + 1}`, income: 1500 + i, expense: 999 }));

  const makeChart = () => ({
    description: { enabled: true }, dragEnabled: true, scaleEnabled: true, pinchZoomEnabled: true, doubleTapToZoomEnabled: true,
    highlightPerTapEnabled: true, drawGridBackgroundEnabled: true, axisRight: { enabled: true },
    axisLeft: { axisMinimum: -1, textColor: '', gridColor: '', drawAxisLine: true, valueFormatter: null as any },
    xAxis: { position: 0, textColor: '', drawGridLines: true, granularity: 0, axisLineColor: '', axisMinimum: 0, axisMaximum: 0, labelCount: 0, labelRotationAngle: 0, valueFormatter: null as any },
    legend: { textColor: '', textSize: 0 }, data: null as any, notifyDataSetChanged: vi.fn(), invalidate: vi.fn(), animateX: vi.fn(),
  });

  it('configures the chart and draws the income and expense lines', () => {
    const fixture = createComponent(MonthlyLinesComponent, { inputs: { rows } });
    const chart = makeChart();
    fixture.componentInstance.onLoaded(chart as never);
    expect(chart.description.enabled).toBe(false);
    expect(chart.axisLeft.valueFormatter.getAxisLabel(1234)).toBe('1.2k');
    expect(chart.axisLeft.valueFormatter.getAxisLabel(12.4)).toBe('12');
    expect(chart.xAxis.valueFormatter.getAxisLabel(0)).toBe('Jan 24');
    expect(chart.xAxis.valueFormatter.getAxisLabel(5)).toBe('Jun 24');
    expect(chart.xAxis.valueFormatter.getAxisLabel(6)).toBe('Jul 24');
    expect(chart.xAxis.valueFormatter.getAxisLabel(99)).toBe('');
    expect(chart.xAxis.labelRotationAngle).toBe(-45);
    expect(chart.xAxis.axisMaximum).toBe(7.5);
    expect(chart.data.dataSets).toHaveLength(2);
    expect(chart.data.dataSets[0].values[1]).toEqual({ x: 1, y: 1501 });
    expect(chart.animateX).toHaveBeenCalledWith(600);
    expect(chart.invalidate).toHaveBeenCalledTimes(1);

    // New rows redraw; empty rows do not.
    fixture.componentRef.setInput('rows', rows.slice(0, 3));
    fixture.detectChanges();
    expect(chart.invalidate).toHaveBeenCalledTimes(2);
    expect(chart.xAxis.labelRotationAngle).toBe(0);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    expect(chart.invalidate).toHaveBeenCalledTimes(2);

    // Light theme colours and French month names.
    nsState.rootView!.cssClasses.add('ns-light');
    settings.update({ language: 'fr' });
    fixture.detectChanges();
    const light = makeChart();
    fixture.componentRef.setInput('rows', rows);
    fixture.componentInstance.onLoaded(light as never);
    expect(light.axisLeft.textColor).toBe('#5b6b85');
    expect(light.xAxis.valueFormatter.getAxisLabel(5)).toBe('Juin 24');
    expect(light.xAxis.valueFormatter.getAxisLabel(6)).toBe('Juil 24');
  });

  it('keeps drawing when a cosmetic setting or the drawing itself fails', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fixture = createComponent(MonthlyLinesComponent, { inputs: { rows } });
    const broken = { ...makeChart(), description: undefined as any, legend: undefined as any, animateX: () => { throw new Error('anim'); } };
    fixture.componentInstance.onLoaded(broken as never);
    expect(broken.data).not.toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('options failed'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('legend failed'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('animation failed'));

    const noAxis = { ...makeChart(), xAxis: undefined as any };
    fixture.componentInstance.onLoaded(noAxis as never);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('render failed'));
    log.mockRestore();
  });
});

describe('StatsPage', () => {
  it('shows the slices of the selected month and of another one', async () => {
    const page = createComponent(StatsPage).componentInstance;
    expect(currentPage().cssClasses.has('tabs-page')).toBe(true);
    expect(page.month()).toBe('2024-03');
    // The seeded occurrence of r1 plus the one generated for r2 make two Logement entries.
    expect(page.expenseSlices().map((s) => [s.label, s.amount])).toEqual([['Alimentation', 40]]);
    expect(page.recurringSlices().map((s) => [s.label, s.amount])).toEqual([['Logement', 1000]]);
    expect(page.expenseSlices()[0].icon).toBeTruthy();

    const modal = TestBed.inject(ModalDialogService);
    vi.mocked(modal.showModal).mockResolvedValueOnce(undefined).mockResolvedValueOnce('2024-01' as never);
    await page.chooseMonth();
    expect(page.month()).toBe('2024-03');
    await page.chooseMonth();
    expect(page.month()).toBe('2024-01');
    expect(budget.selectedMonth()).toBe('2024-03');
    expect(page.expenseSlices().map((s) => s.label)).toEqual(['Transport']);
    expect(page.recurringSlices()).toEqual([]);
  });
});

describe('CategoryPieComponent', () => {
  const slices = [
    { label: 'Logement', amount: 500, fraction: 0.9, color: '#111', icon: 'H' },
    { label: 'Alimentation', amount: 40, fraction: 0.05, color: '#222' },
    { label: 'Divers', amount: 1, fraction: 0.005, color: '#333' },
  ];
  const makeChart = () => ({
    description: { enabled: true }, legend: { enabled: true }, drawHoleEnabled: false, holeRadius: 0, transparentCircleRadiusPercent: 1,
    holeColor: '', drawEntryLabels: true, rotationEnabled: true, highlightPerTapEnabled: true, data: null as any, invalidate: vi.fn(), animateY: vi.fn(),
  });

  it('builds the legend and the pie data', () => {
    const fixture = createComponent(CategoryPieComponent, { inputs: { slices } });
    const pie = fixture.componentInstance;
    expect(pie.kind()).toBe('expense');
    expect(pie.title()).toBe('');
    expect(pie.legend()[0]).toMatchObject({ label: 'Logement', icon: 'H', percent: '90%', columns: `${0.9 * 100}*, ${(1 - 0.9) * 100}*` });
    expect(pie.legend()[1].icon).toBe('');
    expect(pie.legend()[2].percent).toBe('<1%');

    const chart = makeChart();
    pie.onLoaded(chart as never);
    expect(chart.holeColor).toBe('#0a0f1e');
    expect(chart.data.dataSets[0].values.map((v: { percent: string }) => v.percent)).toEqual(['90%', '', '']);
    expect(chart.data.dataSets[0].colors).toEqual(['#111', '#222', '#333']);
    expect(chart.data.valueFormatter.getFormattedValue(0, { percent: '9%' })).toBe('9%');
    expect(chart.data.valueFormatter.getFormattedValue(0, {})).toBe('');
    expect(chart.animateY).toHaveBeenCalledWith(600);
    expect(chart.invalidate).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('slices', []);
    fixture.detectChanges();
    expect(chart.invalidate).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('slices', slices.slice(0, 1));
    fixture.detectChanges();
    expect(chart.invalidate).toHaveBeenCalledTimes(2);

    nsState.rootView!.cssClasses.add('ns-light');
    const light = makeChart();
    pie.onLoaded(light as never);
    expect(light.holeColor).toBe('#f4f6fb');
  });
});

describe('RecurrencesPage', () => {
  it('describes a series and deletes it after confirmation', async () => {
    const page = createComponent(RecurrencesPage).componentInstance;
    const [open, bounded] = budget.recurrences().sort((a, b) => a.id.localeCompare(b.id));
    expect(page.details(open)).    toBe('Monthly \u00B7 day 5 \u00B7 Logement \u00B7 from January 2024');
        expect(page.details(bounded)).toBe('Monthly \u00B7 day 5 \u00B7 Logement \u00B7 February 2024 - April 2024 (3 times)');

    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await page.remove(bounded);
    expect(Dialogs.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('(no description)') }));
    expect(budget.recurrences()).toHaveLength(2);
    await page.remove(open);
    expect(Dialogs.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Rr1') }));
    expect(budget.recurrences().map((r) => r.id)).toEqual(['r2']);
    expect(page.router).toBe(TestBed.inject(RouterExtensions));
  });
});

describe('SettingsPage', () => {
  let page: SettingsPage;
  let calendar: CalendarSyncService;
  beforeEach(() => {
    calendar = TestBed.inject(CalendarSyncService);
    page = createComponent(SettingsPage).componentInstance;
  });

  it('saves the calendar settings and clears the password field', () => {
    const configure = vi.spyOn(calendar, 'configure');
    const check = vi.spyOn(calendar, 'checkConnection').mockResolvedValue();
    const sync = vi.spyOn(calendar, 'syncNow').mockResolvedValue();
    expect(page.passwordPersistent).toBe(true);
    page.calendarEnabled.set(true);
    page.calendarUrl.set('https://cal.example/u/');
    page.calendarUsername.set('me');
    page.calendarPassword.set('pw');
    page.saveCalendar();
    expect(configure).toHaveBeenCalledWith({ enabled: true, calendarUrl: 'https://cal.example/u/', username: 'me', syncIntervalMinutes: 0 }, 'pw', true);
    expect(page.calendarPassword()).toBe('');
    expect(page.calendarUrl()).toBe('https://cal.example/u');

    page.testCalendar();
    expect(configure).toHaveBeenLastCalledWith(expect.anything(), null, false);
    expect(check).toHaveBeenCalled();
    page.syncCalendar();
    expect(sync).toHaveBeenCalled();
  });

  it('navigates to the sub-pages', () => {
    const nav = TestBed.inject(RouterExtensions);
    page.openRecurrences();
    page.openBank();
    expect(vi.mocked(nav.navigate).mock.calls.map((c) => c[0])).toEqual([['recurrences'], ['bank']]);
  });

  it('names the options', () => {
    expect(page.languageName('fr')).toBe('Fran\u00e7ais');
    expect(page.languageName('en')).toBe('English');
    expect(page.dateFormatName('locale')).toBe(settings.t().settings.formatLocale);
    expect(page.dateFormatName('dd-mm-yyyy')).toBe('DD-MM-YYYY');
    expect(page.amountFormatName('locale')).toBe(settings.t().settings.formatLocale);
    expect(page.amountFormatName('space-comma')).toBe('1 234,56');
    expect(page.themeName('dark')).toBe(settings.t().settings.themeDark);
  });

  it('applies the picked option of each setting', async () => {
    const t = settings.t();
    Dialogs.action.mockResolvedValueOnce('Cancel');
    await page.pickLanguage();
    expect(settings.settings().language).toBe('en');
    Dialogs.action.mockResolvedValueOnce('Fran\u00e7ais');
    await page.pickLanguage();
    expect(settings.settings().language).toBe('fr');
    settings.update({ language: 'en' });
    Dialogs.action.mockResolvedValueOnce('CHF');
    await page.pickCurrency();
    expect(settings.settings().currency).toBe('CHF');
    Dialogs.action.mockResolvedValueOnce('YYYY-MM-DD');
    await page.pickDateFormat();
    expect(settings.settings().dateFormat).toBe('yyyy-mm-dd');
    Dialogs.action.mockResolvedValueOnce('1,234.56');
    await page.pickAmountFormat();
    expect(settings.settings().amountFormat).toBe('comma-dot');
    Dialogs.action.mockResolvedValueOnce(t.settings.themeLight);
    await page.pickTheme();
    expect(settings.settings().theme).toBe('light');
  });

  it('saves ordered thresholds only', () => {
    page.low.set('300');
    page.medium.set('200');
    page.high.set('100');
    page.saveThresholds();
    expect(page.message()).toBe(settings.t().settings.thresholdsOrder);
    page.low.set('abc');
    page.saveThresholds();
    expect(page.message()).toBe(settings.t().settings.thresholdsOrder);
    page.low.set('100');
    page.medium.set('200');
    page.high.set('300');
    page.saveThresholds();
    expect(page.message()).toBe('');
    expect(budget.thresholds()).toEqual({ low: 100, medium: 200, high: 300 });
    expect(Dialogs.alert).toHaveBeenCalledWith(expect.objectContaining({ message: settings.t().settings.thresholdsSaved }));
  });

  describe('configuration file', () => {
    let archive: ConfigArchiveService;
    const alerts = (): string[] => Dialogs.alert.mock.calls.map((c) => (c[0] as { message: string }).message);
    const answers = (...texts: (string | null)[]): void => {
      for (const text of texts) Dialogs.prompt.mockResolvedValueOnce(text === null ? { result: false, text: '' } : { result: true, text });
    };

    beforeEach(() => {
      archive = TestBed.inject(ConfigArchiveService);
    });

    it('exports after a passphrase typed twice', async () => {
      const t = settings.t().config;
      const exportEncrypted = vi.spyOn(archive, 'exportEncrypted').mockResolvedValue(true);
      answers(null);
      await page.exportConfig();
      answers('short');
      await page.exportConfig();
      answers('long enough', null);
      await page.exportConfig();
      answers('long enough', 'long enougH');
      await page.exportConfig();
      expect(exportEncrypted).not.toHaveBeenCalled();
      expect(alerts()).toEqual([t.tooShort, t.mismatch]);
      expect(Dialogs.prompt).toHaveBeenLastCalledWith(expect.objectContaining({ inputType: 'password', message: t.confirmPrompt }));

      answers('long enough', 'long enough');
      await page.exportConfig();
      expect(exportEncrypted).toHaveBeenCalledWith('long enough');
      expect(alerts().at(-1)).toBe(t.exported);
      expect(page.configBusy()).toBe(false);

      exportEncrypted.mockResolvedValue(false);
      answers('long enough', 'long enough');
      await page.exportConfig();
      expect(alerts().at(-1)).toBe(t.cancelled);

      exportEncrypted.mockRejectedValue(new Error('disk full'));
      answers('long enough', 'long enough');
      await page.exportConfig();
      expect(alerts().at(-1)).toBe(t.failed('disk full'));
    });

    it('imports a picked file after the summary is confirmed', async () => {
      const t = settings.t().config;
      const data = { ...emptyConfigData(), thresholds: { low: 1, medium: 2, high: 3 } };
      data.calendar = { ...data.calendar, enabled: true, calendarUrl: 'https://cal.example/u', username: 'me', password: 'pw' };
      const pickFile = vi.spyOn(archive, 'pickFile').mockResolvedValue(null);
      const openEncrypted = vi.spyOn(archive, 'openEncrypted').mockResolvedValue(data);
      const apply = vi.spyOn(archive, 'apply');

      await page.importConfig();
      expect(Dialogs.prompt).not.toHaveBeenCalled();
      pickFile.mockResolvedValue('{"file":true}');
      answers(null);
      await page.importConfig();
      expect(openEncrypted).not.toHaveBeenCalled();

      answers('any passphrase');
      Dialogs.confirm.mockResolvedValueOnce(false);
      await page.importConfig();
      expect(openEncrypted).toHaveBeenCalledWith('{"file":true}', 'any passphrase');
      expect(Dialogs.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: t.importTitle, message: page.configSummary(data) }));
      expect(apply).not.toHaveBeenCalled();

      answers('any passphrase');
      Dialogs.confirm.mockResolvedValueOnce(true);
      await page.importConfig();
      expect(apply).toHaveBeenCalledWith(data);
      expect(page.low()).toBe(settings.formatInput(1));
      expect(page.high()).toBe(settings.formatInput(3));
      expect(page.calendarEnabled()).toBe(true);
      expect(page.calendarUrl()).toBe('https://cal.example/u');
      expect(page.calendarUsername()).toBe('me');
      expect(alerts().at(-1)).toBe(t.imported);
      expect(page.configBusy()).toBe(false);
    });

    it('explains why a file could not be imported', async () => {
      const t = settings.t().config;
      const pickFile = vi.spyOn(archive, 'pickFile').mockRejectedValue(new Error('denied'));
      await page.importConfig();
      expect(alerts()).toEqual([t.readFailed]);

      pickFile.mockResolvedValue('text');
      const openEncrypted = vi.spyOn(archive, 'openEncrypted');
      for (const code of ['format', 'passphrase', 'content'] as const) {
        openEncrypted.mockRejectedValueOnce(new ConfigFileError(code));
        answers('any passphrase');
        await page.importConfig();
        expect(alerts().at(-1)).toBe(t.errors[code]);
      }
      openEncrypted.mockRejectedValueOnce('boom');
      answers('any passphrase');
      await page.importConfig();
      expect(alerts().at(-1)).toBe(t.failed('boom'));
    });

    it('lists what the file contains', () => {
      const t = settings.t().config;
      const empty = emptyConfigData();
      expect(page.configSummary(empty)).toBe(`${t.summaryIntro}\n\u2022 ${t.summaryNone}`);
      const full = { ...empty, calendar: { ...empty.calendar, username: 'me', password: 'pw' }, bank: { config: { ...TestBed.inject(BankService).config(), applicationId: 'a' }, privateKey: 'k' } };
      expect(page.configSummary(full)).toBe([t.summaryIntro, `\u2022 ${t.summaryCalendar}`, `\u2022 ${t.summaryCalendarPassword}`, `\u2022 ${t.summaryBank}`, `\u2022 ${t.summaryBankKey}`].join('\n'));
    });
  });
});

describe('BankPage', () => {
  let page: BankPage;
  let bank: BankService;
  beforeEach(() => {
    bank = TestBed.inject(BankService);
    page = createComponent(BankPage).componentInstance;
  });

  it('describes the connection', () => {
    const t = settings.t().bank;
    expect(page.status()).toBe(t.notConnectedStatus);
    expect(page.validity()).toBe('');
    expect(page.lastImport()).toBe(t.lastImport(t.never));
    expect(page.query()).toBe('Bretagne');

    bank['update']({
      config: { ...bank.config(), bankName: 'CMB' },
      session: { sessionId: 's', accounts: [{ uid: 'a', label: 'A' }], validUntil: '2024-09-01T00:00:00Z' },
      lastImportAt: '2024-03-15T09:05:00.000Z',
    });
    expect(page.status()).toBe(t.connectedStatus('CMB', 1));
    expect(page.validity()).toBe(t.validUntil(settings.formatDate('2024-09-01')));
    expect(page.lastImport()).toMatch(/^Last import: .* \d\d:05$/);
  });

  it('saves the credentials and settings', () => {
    page.applicationId.set('app');
    page.privateKey.set('-----BEGIN PRIVATE KEY-----\nk\n-----END PRIVATE KEY-----');
    page.saveCredentials();
    expect(bank.config().applicationId).toBe('app');
    expect(bank.hasKey()).toBe(true);
    expect(page.privateKey()).toBe('');
    page.importFrom.set('2024-02-01');
    page.saveSettings();
    expect(bank.config().importFrom).toBe('2024-02-01');
  });

  it('connects to the bank matching the query, asking when several do', async () => {
    const connect = vi.spyOn(bank, 'connect').mockResolvedValue();
    const banks = [{ name: 'Cr\u00e9dit Mutuel de Bretagne', country: 'FR', maximumConsentSeconds: 1 }, { name: 'Banque de Bretagne', country: 'FR', maximumConsentSeconds: 1 }];
    const list = vi.spyOn(bank, 'listBanks').mockResolvedValue(banks);
    page.applicationId.set('app');
    page.privateKey.set('key');

    page.importFrom.set('bad');
    await page.connect();
    expect(list).not.toHaveBeenCalled();
    page.importFrom.set('2024-01-01');

    page.query.set('nowhere');
    await page.connect();
    expect(Dialogs.alert).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();

    page.query.set('credit mutuel');
    await page.connect();
    expect(connect).toHaveBeenCalledWith(banks[0]);

    page.query.set('bretagne');
    Dialogs.action.mockResolvedValueOnce('Cancel').mockResolvedValueOnce('Banque de Bretagne');
    await page.connect();
    expect(connect).toHaveBeenCalledTimes(1);
    await page.connect();
    expect(connect).toHaveBeenLastCalledWith(banks[1]);

    // When the list failed, the service already explained why.
    list.mockImplementation(async () => { bank.notice.set({ tone: 'error', text: 'down' }); return []; });
    await page.connect();
    expect(Dialogs.alert).toHaveBeenCalledTimes(1);
  });

  it('finishes a pasted return address', async () => {
    const handle = vi.spyOn(bank, 'handleRedirect').mockResolvedValue();
    page.pasted.set('code');
    await page.finish();
    expect(handle).toHaveBeenCalledWith('code');
    expect(page.pasted()).toBe('code');
    bank['update']({ session: { sessionId: 's', accounts: [], validUntil: '' } });
    await page.finish();
    expect(page.pasted()).toBe('');
  });

  it('disconnects and forgets after confirmation', async () => {
    const disconnect = vi.spyOn(bank, 'disconnect');
    const forget = vi.spyOn(bank, 'forgetCredentials');
    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await page.disconnect();
    await page.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);

    page.applicationId.set('app');
    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await page.forget();
    expect(forget).not.toHaveBeenCalled();
    await page.forget();
    expect(forget).toHaveBeenCalled();
    expect(page.applicationId()).toBe('');
    expect(secureState.values.has('bank-private-key')).toBe(false);
    expect(Http.request).not.toHaveBeenCalled();
  });
});
