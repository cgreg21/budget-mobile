import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { PageRouterOutlet, RouterExtensions } from '@nativescript/angular';
import { SlideInOnTopTransition } from 'nativescript-ui-sidedrawer';
import { NativeScriptUISideDrawerModule } from 'nativescript-ui-sidedrawer/angular';

import { DrawerService } from './core/drawer.service';
import { SettingsService } from './core/settings.service';
import { SyncService } from './core/sync.service';
import { UI_ICONS } from './shared/icons';
import { pageTransition } from './shared/page-transition';

const DRAWER_WIDTH = 280;

@Component({
  selector: 'ns-app',
  templateUrl: './app.component.html',
  imports: [PageRouterOutlet, NativeScriptUISideDrawerModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class AppComponent {
  readonly transition = new SlideInOnTopTransition();
  readonly drawerWidth = DRAWER_WIDTH;
  readonly s = inject(SettingsService);
  readonly sync = inject(SyncService);
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
      { url: '/settings', icon: UI_ICONS.settings, label: t.settings.title },
    ];
  });

  readonly syncIcon = computed(() => {
    switch (this.sync.status().state) {
      case 'connecting':
      case 'syncing': return UI_ICONS.syncing;
      case 'offline': return UI_ICONS.cloudOffline;
      case 'error': return UI_ICONS.cloudError;
      default: return UI_ICONS.cloudOk;
    }
  });

  readonly syncText = computed(() => {
    const strings = this.s.t().sync;
    const { state, pending } = this.sync.status();
    return pending > 0 ? `${strings.states[state]} \u00B7 ${strings.pending(pending)}` : strings.states[state];
  });

  constructor() {
    this.sync.start();
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
    });
  }

  go(url: string): void {
    this.drawer.close();
    if (url === this.url()) return;
    void this.nav.navigate([url], { clearHistory: true, transition: pageTransition(this.url(), url) });
  }

  /** Tapping the sync row retries the synchronisation, or opens the settings to fix an error. */
  onSyncTap(): void {
    if (this.sync.status().state === 'error') this.go('/settings');
    else void this.sync.syncNow();
  }
}
