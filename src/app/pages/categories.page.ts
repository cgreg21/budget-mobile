import { Component, NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';

import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { categoryIcon, DEFAULT_CATEGORY_ICON, normalizeCategoryName, type Category } from '../domain/category';
import { CATEGORY_ICON_CHOICES, categoryGlyph } from '../domain/category-icons';
import { UI_ICONS } from '../domain/icons';
import { HeaderComponent } from './header.component';

/** Picker target standing for the category about to be added (a name can never be empty). */
const NEW_CATEGORY = '';

@Component({
  selector: 'ns-categories',
  imports: [NativeScriptCommonModule, HeaderComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './categories.page.html',
})
export class CategoriesPage {
  readonly NEW = NEW_CATEGORY;
  readonly ui = UI_ICONS;
  readonly choices = CATEGORY_ICON_CHOICES;
  readonly glyphOf = categoryGlyph;
  readonly newName = signal('');
  readonly newIcon = signal(DEFAULT_CATEGORY_ICON);
  readonly error = signal('');
  /** The category whose icon is being picked, or `NEW` for the one about to be added. */
  readonly pickerTarget = signal<string | null>(null);
  readonly currentIcon = computed(() => {
    const target = this.pickerTarget();
    if (target === null) return '';
    return target === NEW_CATEGORY ? this.newIcon() : categoryIcon(this.b.categories(), target);
  });

  constructor(
    readonly b: BudgetService, readonly s: SettingsService, readonly router: RouterExtensions,
  ) {}

  add(): void {
    const name = normalizeCategoryName(this.newName());
    if (name === '') return;
    if (this.b.categories().some((c) => c.name === name)) {
      this.error.set(this.s.t().categories.exists(name));
      return;
    }
    this.error.set('');
    this.b.addCategory(name, this.newIcon());
    this.newName.set('');
    this.newIcon.set(DEFAULT_CATEGORY_ICON);
  }

  async rename(category: Category): Promise<void> {
    const t = this.s.t();
    const result = await Dialogs.prompt({
      title: t.categories.rename,
      defaultText: category.name,
      okButtonText: t.common.save,
      cancelButtonText: t.common.cancel,
    });
    const name = normalizeCategoryName(result.text ?? '');
    if (!result.result || name === '' || name === category.name) return;
    if (this.b.categories().some((c) => c.name === name)) {
      this.error.set(t.categories.exists(name));
      return;
    }
    this.error.set('');
    this.b.updateCategory(category.name, { name });
  }

  pickIcon(icon: string): void {
    const target = this.pickerTarget();
    this.pickerTarget.set(null);
    if (target === NEW_CATEGORY) this.newIcon.set(icon);
    else if (target !== null) this.b.updateCategory(target, { icon });
  }

  async remove(category: Category): Promise<void> {
    const t = this.s.t();
    if (this.b.categories().length <= 1) {
      await Dialogs.alert({ message: t.categories.mustKeepOne, okButtonText: t.common.ok });
      return;
    }
    const ok = await Dialogs.confirm({
      title: t.common.delete,
      message: t.categories.deleteBody(category.name),
      okButtonText: t.common.delete,
      cancelButtonText: t.common.cancel,
    });
    if (ok) this.b.removeCategory(category.name);
  }
}
