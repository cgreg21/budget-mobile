import { Component, NO_ERRORS_SCHEMA, inject, input, output } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { Page } from '@nativescript/core';

import { DrawerService } from '../../core/drawer.service';
import { UI_ICONS } from '../icons';
import { PressDirective } from '../motion';

/**
 * Header of the top-level pages: the drawer button on the left, the title, and
 * (when `filterActive` is a boolean) the filters button on the right, highlighted
 * while a filter is in use. It replaces the native action bar, which cannot
 * place custom glyph buttons reliably on both platforms.
 */
@Component({
  selector: 'ns-header',
  imports: [NativeScriptCommonModule, PressDirective],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  readonly title = input.required<string>();
  readonly filterActive = input<boolean | null>(null);
  readonly filtersTap = output<void>();
  readonly d = inject(DrawerService);
  readonly ui = UI_ICONS;

  constructor() {
    inject(Page).actionBarHidden = true;
  }
}
