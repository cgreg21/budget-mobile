import { Dialogs } from '@nativescript/core';
import type { Transaction } from 'budget-lib';

import type { BudgetService } from '../../core/budget.service';
import type { SettingsService } from '../../core/settings.service';

/**
 * Deletes a transaction once confirmed; an occurrence of a recurring series can go alone or
 * with its series. Resolves to whether something was deleted.
 */
export async function deleteTransaction(b: BudgetService, s: SettingsService, transaction: Transaction): Promise<boolean> {
  const t = s.t();
  const { id, recurrenceId } = transaction;

  if (recurrenceId && b.recurrenceOf(transaction)) {
    const choice = await Dialogs.action({
      title: t.budget.deleteTitle,
      message: t.budget.deleteScopeBody,
      cancelButtonText: t.common.cancel,
      actions: [t.budget.thisOccurrence, t.budget.wholeSeries],
    });
    if (choice === t.budget.thisOccurrence) b.remove(id);
    else if (choice === t.budget.wholeSeries) b.removeSeries(id, recurrenceId);
    else return false;
    return true;
  }

  const details = `${transaction.description || t.common.noDescription} (${s.formatSigned(transaction.kind, transaction.amount)})`;
  const ok = await Dialogs.confirm({
    title: t.budget.deleteTitle,
    message: t.budget.deleteBody(details),
    okButtonText: t.common.delete,
    cancelButtonText: t.common.cancel,
  });
  if (ok) b.remove(id);
  return ok;
}
