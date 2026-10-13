import { TestBed } from '@angular/core/testing';
import { ModalDialogService } from '@nativescript/angular';
import { NO_FILTER, type Transaction } from 'budget-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetService } from '~/app/core/budget.service';
import { SettingsService } from '~/app/core/settings.service';
import { BudgetPage } from '~/app/pages/budget/budget.page';
import { deleteTransaction } from '~/app/pages/budget/delete-transaction';
import { EditorModalComponent } from '~/app/pages/budget/editor-modal/editor-modal.component';
import { FiltersModalComponent } from '~/app/pages/budget/filters-modal/filters-modal.component';
import { MonthPickerModalComponent } from '~/app/shared/month-picker-modal/month-picker-modal.component';
import { createComponent, currentPage, openSheetWith, prepareComponents, recurrence, seedDatabase, tx } from './helpers';
import { Dialogs, GestureStateTypes, ScrollView, View, makeRootView, nsState } from './stubs/nativescript-core';

const MONTH = '2024-03';
const SERIES = recurrence('r1', { day: 5, startMonth: '2024-01' });
const SEED = {
  months: {
    [MONTH]: [
      tx('a', { date: '2024-03-10', amount: 40 }),
      tx('b', { date: '2024-03-02', kind: 'income', category: 'Salaire', amount: 2000, description: '' }),
      tx('c', { date: '2024-03-05', category: 'Logement', amount: 500, recurrenceId: 'r1' }),
    ],
  },
  recurrences: [SERIES],
};

let budget: BudgetService;
let settings: SettingsService;

beforeEach(async () => {
  vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
  nsState.rootView = makeRootView();
  prepareComponents(BudgetPage, EditorModalComponent, FiltersModalComponent);
  await seedDatabase(SEED);
  budget = TestBed.inject(BudgetService);
  settings = TestBed.inject(SettingsService);
});

const find = (id: string): Transaction => budget.transactions().find((t) => t.id === id)!;

describe('deleteTransaction', () => {
  it('asks for confirmation before deleting a one-off', async () => {
    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await deleteTransaction(budget, settings, find('a'))).toBe(false);
    expect(budget.transactions()).toHaveLength(3);
    expect(await deleteTransaction(budget, settings, find('b'))).toBe(true);
    expect(Dialogs.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('(no description)') }));
    expect(budget.transactions().map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('lets an occurrence go alone or with its series', async () => {
    const t = settings.t().budget;
    Dialogs.action.mockResolvedValueOnce('Cancel');
    expect(await deleteTransaction(budget, settings, find('c'))).toBe(false);
    Dialogs.action.mockResolvedValueOnce(t.thisOccurrence);
    expect(await deleteTransaction(budget, settings, find('c'))).toBe(true);
    expect(budget.recurrences()).toHaveLength(1);
    expect(budget.transactions().some((x) => x.id === 'c')).toBe(false);

    await seedDatabase(SEED);
    TestBed.resetTestingModule();
    prepareComponents(BudgetPage, EditorModalComponent, FiltersModalComponent);
    budget = TestBed.inject(BudgetService);
    Dialogs.action.mockResolvedValueOnce(t.wholeSeries);
    expect(await deleteTransaction(budget, settings, find('c'))).toBe(true);
    expect(budget.recurrences()).toHaveLength(0);
  });

  it('treats an orphan occurrence as a one-off', async () => {
    Dialogs.confirm.mockResolvedValue(true);
    budget.removeRecurrence('r1');
    const orphan = { ...tx('z'), recurrenceId: 'gone' };
    expect(await deleteTransaction(budget, settings, orphan)).toBe(true);
    expect(Dialogs.action).not.toHaveBeenCalled();
  });
});

describe('FiltersModalComponent', () => {
  const open = (filter = NO_FILTER) => {
    const close = openSheetWith(filter);
    const fixture = createComponent(FiltersModalComponent);
    return { modal: fixture.componentInstance, close };
  };

  it('edits the filter and reports the selected categories', () => {
    const { modal, close } = open();
    expect(modal.hasFilters()).toBe(false);
    expect(modal.categoriesTitle()).toBe(settings.t().budget.categoryFilter);
    modal.toggle('Logement');
    modal.toggle('Santé');
    modal.toggle('Logement');
    expect(modal.filter().categories).toEqual(['Santé']);
    expect(modal.hasFilters()).toBe(true);
    expect(modal.categoriesTitle()).toMatch(/\(1\)$/);
    expect(modal.rows().find((r) => r.name === 'Santé')).toMatchObject({ selected: true, icon: expect.any(String) });
    modal.patch({ kind: 'income' });
    expect(modal.filter().kind).toBe('income');
    modal.reset();
    expect(modal.filter()).toBe(NO_FILTER);
    modal.close(modal.filter());
    expect(close).toHaveBeenCalledWith(NO_FILTER);
  });
});

describe('EditorModalComponent', () => {
  const open = (id: string | null) => {
    const close = openSheetWith({ id });
    const fixture = createComponent(EditorModalComponent);
    return { editor: fixture.componentInstance, close };
  };

  it('starts empty for a new transaction and refuses an invalid amount', async () => {
    const { editor, close } = open(null);
    expect(editor.existing).toBeUndefined();
    expect(editor.kind()).toBe('expense');
    expect(editor.amount()).toBe('');
    expect(editor.category()).toBe('Autres');
    expect(editor.repeat()).toBe(false);
    expect(editor.occurrences()).toBe('12');
    await editor.save();
    expect(editor.error()).toBe(settings.t().editor.invalidAmount);
    expect(close).not.toHaveBeenCalled();

    editor.amount.set('12,5');
    editor.description.set('  Coffee ');
    await editor.save();
    expect(editor.error()).toBe('');
    expect(close).toHaveBeenCalled();
    expect(budget.transactions().at(-1)).toMatchObject({ description: 'Coffee', amount: 12.5, date: '2024-03-15' });
  });

  it('creates a series, bounded or not', async () => {
    const { editor } = open(null);
    editor.amount.set('9.99');
    editor.repeat.set(true);
    editor.frequency.set('quarterly');
    await editor.save();
    expect(budget.recurrences().find((r) => r.amount === 9.99)).toMatchObject({ frequency: 'quarterly', occurrences: undefined });

    const bounded = open(null).editor;
    bounded.amount.set('5');
    bounded.repeat.set(true);
    bounded.limited.set(true);
    bounded.occurrences.set('999');
    await bounded.save();
    expect(budget.recurrences().find((r) => r.amount === 5)!.occurrences).toBe(600);

    const invalid = open(null).editor;
    invalid.amount.set('6');
    invalid.repeat.set(true);
    invalid.limited.set(true);
    invalid.occurrences.set('abc');
    await invalid.save();
    expect(budget.recurrences().find((r) => r.amount === 6)!.occurrences).toBe(1);
  });

  it('loads and updates an existing one-off, optionally turning it into a series', async () => {
    const { editor, close } = open('a');
    expect(editor.existing!.id).toBe('a');
    expect(editor.amount()).toBe(settings.formatInput(40));
    editor.amount.set('41');
    await editor.save();
    expect(find('a').amount).toBe(41);
    expect(close).toHaveBeenCalled();

    const again = open('a').editor;
    again.repeat.set(true);
    await again.save();
    expect(find('a').recurrenceId).toBeDefined();
    expect(budget.recurrences()).toHaveLength(2);
  });

  it('asks how far an edit of an occurrence goes', async () => {
    const t = settings.t().editor;
    const { editor, close } = open('c');
    expect(editor.repeat()).toBe(true);
    expect(editor.frequency()).toBe('monthly');
    editor.amount.set('510');
    Dialogs.action.mockResolvedValueOnce('Cancel');
    await editor.save();
    expect(close).not.toHaveBeenCalled();
    Dialogs.action.mockResolvedValueOnce(t.occurrenceOnly);
    await editor.save();
    expect(find('c').amount).toBe(510);
    expect(budget.recurrences()[0].amount).toBe(500);

    const series = open('c').editor;
    series.amount.set('520');
    Dialogs.action.mockResolvedValueOnce(t.seriesToo);
    await series.save();
    expect(budget.recurrences()[0].amount).toBe(520);
  });

  it('picks the category and the frequency from action sheets', async () => {
    const { editor } = open(null);
    Dialogs.action.mockResolvedValueOnce('Cancel').mockResolvedValueOnce('Transport');
    await editor.pickCategory();
    expect(editor.category()).toBe('Autres');
    await editor.pickCategory();
    expect(editor.category()).toBe('Transport');

    const t = settings.t();
    Dialogs.action.mockResolvedValueOnce('Cancel').mockResolvedValueOnce(t.frequency.yearly);
    await editor.pickFrequency();
    expect(editor.frequency()).toBe('monthly');
    await editor.pickFrequency();
    expect(editor.frequency()).toBe('yearly');
  });

  it('deletes the transaction and closes', async () => {
    const { editor, close } = open('a');
    Dialogs.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await editor.remove();
    expect(close).not.toHaveBeenCalled();
    await editor.remove();
    expect(close).toHaveBeenCalled();
    await open(null).editor.remove();
    expect(Dialogs.confirm).toHaveBeenCalledTimes(2);
  });

  it('scrolls a hidden field into view once the keyboard is up', () => {
    vi.useFakeTimers();
    const { editor } = open(null);
    const field = new View();
    editor.revealField(field as never);
    vi.advanceTimersByTime(400);

    const scroll = new ScrollView();
    scroll.content = new View();
    scroll.getActualSize.mockReturnValue({ width: 300, height: 200 });
    editor.bindScroll(scroll as never);
    field.getLocationRelativeTo.mockReturnValue({ x: 0, y: 100 });
    field.getActualSize.mockReturnValue({ width: 300, height: 40 });
    editor.revealField(field as never);
    vi.advanceTimersByTime(400);
    expect(scroll.scrollToVerticalOffset).not.toHaveBeenCalled();

    field.getLocationRelativeTo.mockReturnValue({ x: 0, y: 300 });
    editor.revealField(field as never);
    vi.advanceTimersByTime(400);
    expect(scroll.scrollToVerticalOffset).toHaveBeenCalledWith(284, true);

    scroll.verticalOffset = 500;
    field.getLocationRelativeTo.mockReturnValue({ x: 0, y: 10 });
    editor.revealField(field as never);
    vi.advanceTimersByTime(400);
    expect(scroll.scrollToVerticalOffset).toHaveBeenLastCalledWith(0, true);
    vi.useRealTimers();
  });
});

describe('BudgetPage', () => {
  let page: BudgetPage;
  let modal: ModalDialogService;

  beforeEach(() => {
    modal = TestBed.inject(ModalDialogService);
    page = createComponent(BudgetPage).componentInstance;
  });

  it('derives the tabs, counts and level from the budget', () => {
    expect(currentPage().cssClasses.has('tabs-page')).toBe(true);
    expect(page.recurringCount()).toBe(1);
    expect(page.oneOffCount()).toBe(2);
    expect(page.level()).toBeTruthy();
    expect(page.hasFilters()).toBe(false);
    const [oneoff, recurring] = page.panels();
    expect(oneoff.items.map((t) => t.id)).toEqual(['a', 'b']);
    expect(recurring.items.map((t) => t.id)).toEqual(['c']);
    expect(oneoff.message).toBe(settings.t().budget.noMatch);

    page.filter.set({ ...NO_FILTER, kind: 'income' });
    expect(page.hasFilters()).toBe(true);
    expect(page.panels()[0].items.map((t) => t.id)).toEqual(['b']);
    expect(page.panels()[1].message).toBe(settings.t().budget.noMatch);

    budget.selectMonth('2023-01');
    page.filter.set(NO_FILTER);
    expect(page.panels()[0].message).toBe(settings.t().budget.emptyOneOff);
    expect(page.panels()[1].message).toBe(settings.t().budget.emptyRecurring);
  });

  it('describes a row', () => {
    expect(page.subtitle(find('a'))).toBe('10 · Alimentation');
    expect(page.subtitle(find('c'))).toBe(`05 · Logement · ↻ ${settings.t().budget.recurringBadge}`);
  });

  it('opens the sheets and applies their results', async () => {
    vi.mocked(modal.showModal).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...NO_FILTER, kind: 'expense' } as never);
    await page.openFilters();
    expect(page.hasFilters()).toBe(false);
    await page.openFilters();
    expect(page.filter().kind).toBe('expense');
    expect(modal.showModal).toHaveBeenLastCalledWith(FiltersModalComponent, expect.objectContaining({ fullscreen: false }));

    page.openEditor(null);
    expect(modal.showModal).toHaveBeenLastCalledWith(EditorModalComponent, expect.objectContaining({ context: { id: null }, fullscreen: true }));
    page.edit(find('a'));
    expect(modal.showModal).toHaveBeenLastCalledWith(EditorModalComponent, expect.objectContaining({ context: { id: 'a' } }));

    vi.mocked(modal.showModal).mockResolvedValueOnce(undefined).mockResolvedValueOnce('2024-01' as never);
    await page.chooseMonth();
    expect(budget.selectedMonth()).toBe(MONTH);
    await page.chooseMonth();
    expect(budget.selectedMonth()).toBe('2024-01');
    expect(modal.showModal).toHaveBeenLastCalledWith(MonthPickerModalComponent, expect.anything());
  });

  describe('swipe to delete', () => {
    const pan = (row: View, state: number, deltaX = 0, deltaY = 0) => page.onPan({ state, deltaX, deltaY, object: row } as never);
    const swipeOpen = (row: View): void => {
      pan(row, GestureStateTypes.began);
      pan(row, GestureStateTypes.changed, -60, 2);
      pan(row, GestureStateTypes.ended);
    };

    it('reveals the delete button when swiped far enough', () => {
      const row = new View();
      pan(row, GestureStateTypes.began);
      pan(row, GestureStateTypes.changed, -4, 3);
      expect(row.translateX).toBe(0);
      pan(row, GestureStateTypes.changed, -30, 3);
      expect(row.translateX).toBe(-30);
      pan(row, GestureStateTypes.changed, -200, 3);
      expect(row.translateX).toBe(-88);
      pan(row, GestureStateTypes.changed, 50, 3);
      expect(row.translateX).toBe(0);
      pan(row, GestureStateTypes.changed, -60, 3);
      pan(row, GestureStateTypes.ended);
      expect(row.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: -88, y: 0 } }));

      // A tap now closes the row instead of opening the editor.
      page.edit(find('a'));
      expect(modal.showModal).not.toHaveBeenCalled();
      expect(row.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: 0, y: 0 } }));
      page.edit(find('a'));
      expect(modal.showModal).toHaveBeenCalled();
    });

    it('snaps back from a short swipe and ignores vertical moves and foreign rows', () => {
      const row = new View();
      pan(row, GestureStateTypes.began);
      pan(row, GestureStateTypes.changed, -20, 0);
      pan(row, GestureStateTypes.ended);
      expect(row.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: 0, y: 0 } }));

      const vertical = new View();
      pan(vertical, GestureStateTypes.began);
      pan(vertical, GestureStateTypes.changed, 2, 40);
      pan(vertical, GestureStateTypes.changed, -40, 40);
      expect(vertical.translateX).toBe(0);
      pan(vertical, GestureStateTypes.ended);
      expect(vertical.animate).not.toHaveBeenCalled();

      const other = new View();
      pan(other, GestureStateTypes.changed, -50, 0);
      pan(other, GestureStateTypes.ended);
      expect(other.translateX).toBe(0);
      pan(row, GestureStateTypes.began);
      pan(other, GestureStateTypes.changed, -50, 0);
      expect(other.translateX).toBe(0);
    });

    it('closes the open row when another one starts moving, or when deleting from it', () => {
      const first = new View();
      const second = new View();
      swipeOpen(first);
      first.isLoaded = false;
      pan(second, GestureStateTypes.began);
      expect(first.animate).toHaveBeenCalledTimes(1);
      pan(second, GestureStateTypes.changed, -60, 0);
      pan(second, GestureStateTypes.ended);
      swipeOpen(second);
      expect(second.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: -88, y: 0 } }));

      Dialogs.confirm.mockResolvedValue(true);
      page.deleteFromSwipe(find('a'));
      expect(second.animate).toHaveBeenLastCalledWith(expect.objectContaining({ translate: { x: 0, y: 0 } }));
    });
  });
});
