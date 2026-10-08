import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { Dialogs, type View } from '@nativescript/core';
import {
  CATEGORY_ICON_CHOICES, categoryIcon, DEFAULT_CATEGORY_ICON, normalizeCategoryName, type Category,
} from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { SettingsService } from '../../core/settings.service';
import { categoryGlyph, UI_ICONS } from '../../shared/icons';
import { HeaderComponent } from '../../shared/header/header.component';
import { ListReveal } from '../../shared/list-reveal';
import { AppearDirective } from '../../shared/motion';

/** Picker target standing for the category about to be added (a name can never be empty). */
const NEW_CATEGORY = '';

@Component({
  selector: 'ns-categories',
  imports: [NativeScriptCommonModule, HeaderComponent, AppearDirective],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './categories.page.html',
})
export class CategoriesPage {
  readonly b = inject(BudgetService);
  readonly s = inject(SettingsService);
  readonly NEW = NEW_CATEGORY;
  readonly ui = UI_ICONS;
  readonly choices = CATEGORY_ICON_CHOICES;
  readonly glyphOf = categoryGlyph;
  readonly reveal = new ListReveal();

  readonly newName = signal('');
  readonly newIcon = signal(DEFAULT_CATEGORY_ICON);
  readonly error = signal('');
  /** The category being renamed in the dialog, and the name typed so far. */
  readonly renaming = signal<Category | null>(null);
  readonly renameText = signal('');
  /** The category whose icon is being picked, or `NEW` for the one about to be added. */
  readonly pickerTarget = signal<string | null>(null);
  readonly currentIcon = computed(() => {
    const target = this.pickerTarget();
    if (target === null) return '';
    return target === NEW_CATEGORY ? this.newIcon() : categoryIcon(this.b.categories(), target);
  });

  add(): void {
    const name = normalizeCategoryName(this.newName());
    if (name === '' || !this.isAvailable(name)) return;
    this.b.addCategory(name, this.newIcon());
    this.newName.set('');
    this.newIcon.set(DEFAULT_CATEGORY_ICON);
  }

  rename(category: Category): void {
    this.error.set('');
    this.renameText.set(category.name);
    this.renaming.set(category);
  }

  cancelRename(): void {
    this.error.set('');
    this.renaming.set(null);
  }

  confirmRename(): void {
    const category = this.renaming();
    if (category === null) return;
    const name = normalizeCategoryName(this.renameText());
    if (name === category.name) {
      this.cancelRename();
      return;
    }
    if (name === '' || !this.isAvailable(name)) return;
    this.renaming.set(null);
    this.b.updateCategory(category.name, { name });
  }

  /** Opens the keyboard on the field as soon as the dialog is shown. */
  focusField(field: View): void {
    setTimeout(() => field.focus(), 300);
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

  /** Whether no category has this name yet; otherwise the error says so. */
  private isAvailable(name: string): boolean {
    const taken = this.b.categories().some((c) => c.name === name);
    this.error.set(taken ? this.s.t().categories.exists(name) : '');
    return !taken;
  }
}
