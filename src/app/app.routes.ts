import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/budget', pathMatch: 'full' },
  { path: 'budget', loadComponent: () => import('./pages/budget/budget.page').then((m) => m.BudgetPage) },
  { path: 'stats', loadComponent: () => import('./pages/stats/stats.page').then((m) => m.StatsPage) },
  { path: 'history', loadComponent: () => import('./pages/history/history.page').then((m) => m.HistoryPage) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
  { path: 'categories', loadComponent: () => import('./pages/categories/categories.page').then((m) => m.CategoriesPage) },
  { path: 'recurrences', loadComponent: () => import('./pages/settings/recurrences/recurrences.page').then((m) => m.RecurrencesPage) },
];
