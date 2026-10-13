import { TestBed } from '@angular/core/testing';
import { RouterExtensions } from '@nativescript/angular';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppComponent } from '~/app/app.component';
import { BudgetService } from '~/app/core/budget.service';
import { CalendarSyncService } from '~/app/core/calendar-sync.service';
import { DrawerService } from '~/app/core/drawer.service';
import { SettingsService } from '~/app/core/settings.service';
import { HeaderComponent } from '~/app/shared/header/header.component';
import { MonthBarComponent } from '~/app/shared/month-bar/month-bar.component';
import { MonthPickerModalComponent } from '~/app/shared/month-picker-modal/month-picker-modal.component';
import { createComponent, currentPage, openSheetWith, prepareComponents, seedDatabase, tx } from './helpers';
import { makeRootView, nsState } from './stubs/nativescript-core';

describe('HeaderComponent', () => {
  it('hides the action bar and exposes the drawer', () => {
    const fixture = createComponent(HeaderComponent, { inputs: { title: 'Budget' } });
    expect(currentPage().actionBarHidden).toBe(true);
    expect(fixture.componentInstance.title()).toBe('Budget');
    expect(fixture.componentInstance.filterActive()).toBeNull();
    expect(fixture.componentInstance.d).toBe(TestBed.inject(DrawerService));
    expect(fixture.componentInstance.ui.menu).toBeTruthy();
  });
});

describe('MonthBarComponent', () => {
  it('shifts by month and by year within the bounds', () => {
    const fixture = createComponent(MonthBarComponent, { inputs: { month: '2024-03' } });
    const bar = fixture.componentInstance;
    const changes: string[] = [];
    bar.monthChange.subscribe((month) => changes.push(month));
    expect(bar.hasOlder()).toBe(true);
    expect(bar.hasNewer()).toBe(true);
    bar.shift(1);
    bar.shift(-1);
    bar.shiftYear(1);
    bar.shiftYear(-1);
    expect(changes).toEqual(['2024-04', '2024-02', '2025-03', '2023-03']);

    fixture.componentRef.setInput('month', '1970-01');
    expect(bar.hasOlder()).toBe(false);
    fixture.componentRef.setInput('month', '2099-12');
    expect(bar.hasNewer()).toBe(false);
  });
});

describe('MonthPickerModalComponent', () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
    await seedDatabase({ months: { '2024-01': [tx('a', { date: '2024-01-05' })] } });
  });

  it('lays out the twelve months of a year with their state', () => {
    const close = openSheetWith('2024-06');
    prepareComponents(MonthPickerModalComponent);
    TestBed.inject(BudgetService).selectMonth('2024-03');
    const fixture = createComponent(MonthPickerModalComponent);
    const picker = fixture.componentInstance;
    expect(picker.year()).toBe(2024);
    expect(picker.currentMonth).toBe('2024-03');
    expect(picker.firstYear).toBeLessThan(picker.lastYear);
    const months = picker.months();
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ key: '2024-01', row: 0, col: 0, class: 'chip chip-data' });
    expect(months[2]).toMatchObject({ key: '2024-03', row: 0, col: 2, class: 'chip chip-editing' });
    expect(months[5]).toMatchObject({ key: '2024-06', row: 1, col: 2, class: 'chip chip-active' });
    expect(months[11]).toMatchObject({ key: '2024-12', row: 3, col: 2, class: 'chip' });
    expect(months.map((m) => m.label)).toEqual(TestBed.inject(SettingsService).t().months);

    picker.year.set(2023);
    expect(picker.months().every((m) => m.class === 'chip')).toBe(true);
    picker.close('2023-02');
    expect(close).toHaveBeenCalledWith('2023-02');
  });
});

describe('AppComponent', () => {
  let events: Subject<unknown>;

  beforeEach(async () => {
    await seedDatabase();
    events = new Subject();
    nsState.rootView = makeRootView();
    prepareComponents(AppComponent);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
  });

  it('starts the services and follows the navigation', () => {
    const calendar = TestBed.inject(CalendarSyncService);
    const start = vi.spyOn(calendar, 'start');
    const fixture = createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(start).toHaveBeenCalled();
    expect(app.url()).toBe('/budget');
    expect(app.items().map((i) => i.url)).toEqual(['/budget', '/categories', '/stats', '/history']);
    expect(app.drawerWidth).toBe(280);

    events.next(new NavigationStart(1, '/stats'));
    expect(app.url()).toBe('/budget');
    events.next(new NavigationEnd(1, '/stats', '/stats'));
    expect(app.url()).toBe('/stats');

    fixture.destroy();
    events.next(new NavigationEnd(2, '/history', '/history'));
    expect(app.url()).toBe('/stats');
  });

  it('navigates from the drawer, except to the current page', () => {
    const app = createComponent(AppComponent).componentInstance;
    const nav = TestBed.inject(RouterExtensions);
    const drawer = TestBed.inject(DrawerService);
    const close = vi.spyOn(drawer, 'close');
    app.go('/budget');
    expect(close).toHaveBeenCalledTimes(1);
    expect(nav.navigate).not.toHaveBeenCalled();
    app.go('/stats');
    expect(nav.navigate).toHaveBeenCalledWith(['/stats'], expect.objectContaining({ clearHistory: true, transition: expect.objectContaining({ name: 'slideLeft' }) }));
  });

  it('syncs the calendar on tap, or opens the settings when it failed', () => {
    const app = createComponent(AppComponent).componentInstance;
    const calendar = TestBed.inject(CalendarSyncService);
    const sync = vi.spyOn(calendar, 'syncNow').mockResolvedValue(undefined as never);
    app.onCalendarTap();
    expect(sync).toHaveBeenCalledTimes(1);
    (calendar as unknown as { state: { set(value: unknown): void } }).state.set({ state: 'error', message: 'x', pending: 0 });
    app.onCalendarTap();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(RouterExtensions).navigate).toHaveBeenCalledWith(['/settings'], expect.anything());
  });
});
