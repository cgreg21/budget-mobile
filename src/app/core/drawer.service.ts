import { Injectable } from '@angular/core';
import { Application } from '@nativescript/core';
import type { RadSideDrawer } from 'nativescript-ui-sidedrawer';

/** Controls the side drawer, which is the root view of the application. */
@Injectable({ providedIn: 'root' })
export class DrawerService {
  show(): void {
    this.root()?.showDrawer();
  }

  close(): void {
    this.root()?.closeDrawer();
  }

  private root(): RadSideDrawer | null {
    const view = Application.getRootView() as Partial<RadSideDrawer> | undefined;
    return typeof view?.showDrawer === 'function' ? (view as RadSideDrawer) : null;
  }
}
