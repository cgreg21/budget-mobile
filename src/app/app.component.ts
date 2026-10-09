import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { PageRouterOutlet, RouterExtensions } from '@nativescript/angular';
import { SlideInOnTopTransition } from 'nativescript-ui-sidedrawer';
import { NativeScriptUISideDrawerModule } from 'nativescript-ui-sidedrawer/angular';

import { BankService } from './core/bank/bank.service';
import { CalendarSyncService } from './core/calendar-sync.service';
import { DrawerService } from './core/drawer.service';
import { SettingsService } from './core/settings.service';
import { UI_ICONS } from './shared/icons';
import { PressDirective } from './shared/motion';
import { pageTransition } from './shared/page-transition';

const DRAWER_WIDTH = 280;

@Component({
  selector: 'ns-app',
  templateUrl: './app.component.html',
  imports: [PageRouterOutlet, NativeScriptUISideDrawerModule, PressDirective],
  schemas: [NO_ERRORS_SCHEMA],
})
export class AppComponent {
  readonly transition = new SlideInOnTopTransition();
  readonly drawerWidth = DRAWER_WIDTH;
  readonly logo = UI_ICONS.logo;
  readonly settingsIcon = UI_ICONS.settings;
  readonly s = inject(SettingsService);
  readonly calendar = inject(CalendarSyncService);
  readonly calendarIcon = UI_ICONS.calendar;
  private readonly bank = inject(BankService);
  private readonly drawer = inject(DrawerService);
  private readonly nav = inject(RouterExtensions);

  /** Route of the page on screen, to highlight its entry. */
  readonly url = signal('/budget');

  readonly items = computed(() => {
    const t = this.s.t();
    return [
      { url: '/budget', icon: UI_ICONS.transactions, label: t.nav.transactions },
      { url: '/categories', icon: UI_ICONS.categories, label: t.categories.title },
      { url: '/stats', icon: UI_ICONS.stats, label: t.stats.title },
      { url: '/history', icon: UI_ICONS.history, label: t.stats.history },
    ];
  });

  constructor() {
    this.calendar.start();
    this.bank.start();
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
    });
  }

  onCalendarTap(): void {
    if (this.calendar.status().state === 'error') this.go('/settings');
    else void this.calendar.syncNow();
  }

  go(url: string): void {
    this.drawer.close();
    if (url === this.url()) return;
    void this.nav.navigate([url], { clearHistory: true, transition: pageTransition(this.url(), url) });
  }
}
