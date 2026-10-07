/*
 * core/i18n.ts - every piece of text the UI shows, in French and English.
 * `Strings` is the contract: both dictionaries implement it in full, so a
 * missing translation is a compile error rather than a blank label.
 */
import type { AppLanguage } from '../domain/general-settings';

export interface Strings {
  appName: string;
  nav: { transactions: string };
  common: {
    cancel: string; delete: string; save: string; add: string; edit: string;
    expense: string; income: string; all: string; back: string; yes: string; no: string;
    noDescription: string; errorTitle: string; ok: string;
  };
  frequency: { monthly: string; quarterly: string; yearly: string };
  months: string[];
  budget: {
    balance: string; income: string; expenses: string; today: string;
    searchPlaceholder: string; emptyTitle: string; emptyText: string;
    noMatch: string; recurringBadge: string; listCount(shown: number, total: number): string;
    tabTransactions: string; tabRecurring: string; emptyRecurring: string; emptyOneOff: string; currentMonth: string;
    deleteTitle: string; deleteBody(details: string): string;
    deleteScopeBody: string; thisOccurrence: string; wholeSeries: string;
    categoryFilter: string; resetFilters: string; filters: string;
  };
  levels: { critical: string; low: string; medium: string; high: string };
  editor: {
    newTitle: string; editTitle: string; type: string; amount: string; description: string;
    category: string; date: string; repeat: string; frequency: string; limited: string;
    occurrences: string; invalidAmount: string; invalidDate: string; scopeTitle: string;
    scopeBody: string; occurrenceOnly: string; seriesToo: string; day: string;
  };
  stats: {
    title: string; expensesByCategory: string; fromMonth: string; toMonth: string; recurringExpensesByCategory: string; history: string;
    noData: string;
  };
  settings: {
    title: string; general: string; language: string; currency: string; dateFormat: string;
    amountFormat: string; theme: string; themeSystem: string; themeLight: string;
    themeDark: string; formatLocale: string; thresholds: string; thresholdsHelp: string;
    low: string; medium: string; high: string; thresholdsOrder: string; thresholdsSaved: string;
    manage: string; categories: string; recurrences: string; chooseOption: string;
  };
  sync: {
    title: string; help: string; server: string; username: string; password: string;
    passwordKept: string; remoteDir: string; enable: string; save: string; syncNow: string;
    stateDisabled: string; stateConnecting: string; stateSyncing: string; stateOnline: string;
    stateOffline: string; stateError: string; offlineNote: string; never: string;
    lastSync(date: string): string; pending(count: number): string; passwordSession: string;
    provider: string; providerWebdav: string; providerIcloud: string; icloudHelp: string;
  };
  categories: {
    title: string; newName: string; newIcon: string; exists(name: string): string;
    mustKeepOne: string; deleteBody(name: string): string; rename: string; pickIcon: string;
  };
  recurrences: {
    title: string; empty: string; deleteBody(name: string): string;
    from(month: string): string; range(start: string, end: string, count: number): string;
    dayOf(day: number): string;
  };
}

const en: Strings = {
  appName: 'Budget',
  nav: { transactions: 'Transactions' },
  common: {
    cancel: 'Cancel', delete: 'Delete', save: 'Save', add: 'Add', edit: 'Edit',
    expense: 'Expense', income: 'Income', all: 'All', back: 'Back', yes: 'Yes', no: 'No',
    noDescription: '(no description)', errorTitle: 'Error', ok: 'OK',
  },
  frequency: { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' },
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'],
  budget: {
    balance: 'Balance', income: 'Income', expenses: 'Expenses', today: 'Today',
    searchPlaceholder: 'Search...', emptyTitle: 'No transactions',
    emptyText: 'Tap + to add your first transaction of the month.',
    noMatch: 'No transaction matches these filters.', recurringBadge: 'recurring',
    tabTransactions: 'Transactions', tabRecurring: 'Recurring', currentMonth: 'Current month',
    emptyRecurring: 'No recurring transactions this month.', emptyOneOff: 'No one-off transactions this month.',
    listCount: (shown, total) => `${shown} of ${total} transactions`,
    deleteTitle: 'Delete transaction?',
    deleteBody: (details) => `${details} will be permanently deleted.`,
    deleteScopeBody: 'This transaction belongs to a recurring series.',
    thisOccurrence: 'This occurrence only', wholeSeries: 'Delete the whole series',
    categoryFilter: 'Category', resetFilters: 'Reset', filters: 'Filters',
  },
  levels: { critical: 'Critical', low: 'Low', medium: 'Medium', high: 'Comfortable' },
  editor: {
    newTitle: 'New transaction', editTitle: 'Edit transaction', type: 'Type', amount: 'Amount',
    description: 'Description', category: 'Category', date: 'Date', repeat: 'Repeat',
    frequency: 'Frequency', limited: 'Limit the number of occurrences',
    occurrences: 'Occurrences', invalidAmount: 'Enter an amount greater than zero.',
    invalidDate: 'The date is not valid.', scopeTitle: 'Apply the change to',
    scopeBody: 'This transaction is part of a recurring series.',
    occurrenceOnly: 'This occurrence only', seriesToo: 'The whole series', day: 'Day',
  },
  stats: {
    title: 'Statistics', expensesByCategory: 'Expenses by category',
    fromMonth: 'From', toMonth: 'To',
    recurringExpensesByCategory: 'Recurring expenses by category',
    history: 'History', noData: 'Nothing to show yet.',
  },
  settings: {
    title: 'Settings', general: 'General', language: 'Language', currency: 'Currency',
    dateFormat: 'Date format', amountFormat: 'Amount format', theme: 'Theme',
    themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark', formatLocale: 'Language default',
    thresholds: 'Balance thresholds',
    thresholdsHelp: 'Below Low: critical. Low to Medium: low. Medium to High: medium. Above High: comfortable.',
    low: 'Low (x)', medium: 'Medium (y)', high: 'High (z)',
    thresholdsOrder: 'Thresholds must satisfy x < y < z.', thresholdsSaved: 'Thresholds saved',
    manage: 'Manage', categories: 'Categories', recurrences: 'Recurring transactions',
    chooseOption: 'Choose',
  },
  sync: {
    title: 'Synchronisation',
    help: 'Stores the budget on a WebDAV server (Infomaniak kDrive) in the same layout as the desktop app. '
      + 'Without a connection you can keep editing: changes are sent later.',
    provider: 'Storage', providerWebdav: 'kDrive (WebDAV)', providerIcloud: 'iCloud Drive',
    icloudHelp: 'Stores the budget in this app\'s iCloud Drive folder, shared between your Apple devices. '
      + 'Needs iCloud Drive turned on for this device. Without a connection you can keep editing.',
    server: 'Server address (WebDAV)', username: 'Username (e-mail)', password: 'Password / app password',
    passwordKept: 'Leave empty to keep the saved password', remoteDir: 'Remote folder',
    enable: 'Synchronise', save: 'Save and synchronise', syncNow: 'Synchronise now',
    stateDisabled: 'Synchronisation off', stateConnecting: 'Connecting…', stateSyncing: 'Synchronising…',
    stateOnline: 'Up to date', stateOffline: 'Offline', stateError: 'Error',
    offlineNote: 'Changes are kept on this device and sent when the server is reachable.',
    never: 'never', lastSync: (date) => `Last synchronisation: ${date}`,
    pending: (count) => (count === 1 ? '1 change waiting' : `${count} changes waiting`),
    passwordSession: 'The password cannot be stored securely on this build; it will be asked again after a restart.',
  },
  categories: {
    title: 'Categories', newName: 'New category', newIcon: 'Emoji',
    exists: (name) => `The category "${name}" already exists.`,
    mustKeepOne: 'At least one category must remain.',
    deleteBody: (name) => `Delete "${name}"? Existing transactions keep it; only the list offered for new ones changes.`,
    rename: 'Rename', pickIcon: 'Change the emoji',
  },
  recurrences: {
    title: 'Recurring transactions', empty: 'No recurring transaction yet. Enable "Repeat" when adding a transaction.',
    deleteBody: (name) => `Stop "${name}"? Occurrences already created stay in their months.`,
    from: (month) => `from ${month}`, range: (start, end, count) => `${start} - ${end} (${count} times)`,
    dayOf: (day) => `day ${day}`,
  },
};

const fr: Strings = {
  appName: 'Budget',
  nav: { transactions: 'Transactions' },
  common: {
    cancel: 'Annuler', delete: 'Supprimer', save: 'Enregistrer', add: 'Ajouter', edit: 'Modifier',
    expense: 'Dépense', income: 'Revenu', all: 'Tout', back: 'Retour', yes: 'Oui', no: 'Non',
    noDescription: '(sans description)', errorTitle: 'Erreur', ok: 'OK',
  },
  frequency: { monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' },
  months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
    'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  budget: {
    balance: 'Solde', income: 'Revenus', expenses: 'Dépenses', today: "Aujourd'hui",
    searchPlaceholder: 'Rechercher...', emptyTitle: 'Aucune transaction',
    emptyText: 'Appuyez sur + pour ajouter votre première transaction du mois.',
    noMatch: 'Aucune transaction ne correspond à ces filtres.', recurringBadge: 'récurrente',
    tabTransactions: 'Transactions', tabRecurring: 'Récurrentes', currentMonth: 'Mois en cours',
    emptyRecurring: 'Aucune transaction récurrente ce mois-ci.', emptyOneOff: 'Aucune transaction ponctuelle ce mois-ci.',
    listCount: (shown, total) => `${shown} sur ${total} transactions`,
    deleteTitle: 'Supprimer la transaction ?',
    deleteBody: (details) => `${details} sera définitivement supprimée.`,
    deleteScopeBody: 'Cette transaction fait partie d’une série récurrente.',
    thisOccurrence: 'Cette occurrence uniquement', wholeSeries: 'Supprimer toute la série',
    categoryFilter: 'Catégorie', resetFilters: 'Réinitialiser', filters: 'Filtres',
  },
  levels: { critical: 'Critique', low: 'Faible', medium: 'Moyen', high: 'Confortable' },
  editor: {
    newTitle: 'Nouvelle transaction', editTitle: 'Modifier la transaction', type: 'Type',
    amount: 'Montant', description: 'Description', category: 'Catégorie', date: 'Date',
    repeat: 'Répéter', frequency: 'Fréquence', limited: "Limiter le nombre d'occurrences",
    occurrences: 'Occurrences', invalidAmount: 'Saisissez un montant supérieur à zéro.',
    invalidDate: "La date n'est pas valide.", scopeTitle: 'Appliquer la modification à',
    scopeBody: 'Cette transaction fait partie d’une série récurrente.',
    occurrenceOnly: 'Cette occurrence uniquement', seriesToo: 'Toute la série', day: 'Jour',
  },
  stats: {
    title: 'Statistiques', expensesByCategory: 'Dépenses par catégorie',
    fromMonth: 'Du', toMonth: 'Au',
    recurringExpensesByCategory: 'Dépenses récurrentes par catégorie',
    history: 'Historique', noData: 'Rien à afficher pour le moment.',
  },
  settings: {
    title: 'Réglages', general: 'Général', language: 'Langue', currency: 'Devise',
    dateFormat: 'Format de date', amountFormat: 'Format des montants', theme: 'Thème',
    themeSystem: 'Système', themeLight: 'Clair', themeDark: 'Sombre', formatLocale: 'Selon la langue',
    thresholds: 'Seuils du solde',
    thresholdsHelp: 'Sous Faible : critique. De Faible à Moyen : faible. De Moyen à Élevé : moyen. Au-delà d’Élevé : confortable.',
    low: 'Faible (x)', medium: 'Moyen (y)', high: 'Élevé (z)',
    thresholdsOrder: 'Les seuils doivent respecter x < y < z.', thresholdsSaved: 'Seuils enregistrés',
    manage: 'Gérer', categories: 'Catégories', recurrences: 'Transactions récurrentes',
    chooseOption: 'Choisir',
  },
  sync: {
    title: 'Synchronisation',
    help: 'Stocke le budget sur un serveur WebDAV (Infomaniak kDrive), avec la même organisation que l’application de bureau. '
      + 'Hors connexion, vous pouvez continuer à modifier : les changements sont envoyés plus tard.',
    provider: 'Stockage', providerWebdav: 'kDrive (WebDAV)', providerIcloud: 'iCloud Drive',
    icloudHelp: 'Stocke le budget dans le dossier iCloud Drive de l’application, partagé entre vos appareils Apple. '
      + 'iCloud Drive doit être activé sur cet appareil. Hors connexion, vous pouvez continuer à modifier.',
    server: 'Adresse du serveur (WebDAV)', username: 'Identifiant (e-mail)', password: 'Mot de passe / mot de passe d’application',
    passwordKept: 'Laisser vide pour conserver le mot de passe enregistré', remoteDir: 'Dossier distant',
    enable: 'Synchroniser', save: 'Enregistrer et synchroniser', syncNow: 'Synchroniser maintenant',
    stateDisabled: 'Synchronisation désactivée', stateConnecting: 'Connexion…', stateSyncing: 'Synchronisation…',
    stateOnline: 'À jour', stateOffline: 'Hors ligne', stateError: 'Erreur',
    offlineNote: 'Les changements restent sur cet appareil et seront envoyés dès que le serveur sera joignable.',
    never: 'jamais', lastSync: (date) => `Dernière synchronisation : ${date}`,
    pending: (count) => (count === 1 ? '1 modification en attente' : `${count} modifications en attente`),
    passwordSession: 'Le mot de passe ne peut pas être stocké de façon sécurisée avec cette version ; il sera redemandé après un redémarrage.',
  },
  categories: {
    title: 'Catégories', newName: 'Nouvelle catégorie', newIcon: 'Emoji',
    exists: (name) => `La catégorie « ${name} » existe déjà.`,
    mustKeepOne: 'Il faut conserver au moins une catégorie.',
    deleteBody: (name) => `Supprimer « ${name} » ? Les transactions existantes la gardent ; seule la liste proposée à la saisie change.`,
    rename: 'Renommer', pickIcon: "Changer l'emoji",
  },
  recurrences: {
    title: 'Transactions récurrentes', empty: 'Aucune transaction récurrente. Activez « Répéter » en ajoutant une transaction.',
    deleteBody: (name) => `Arrêter « ${name} » ? Les occurrences déjà créées restent dans leurs mois.`,
    from: (month) => `à partir de ${month}`, range: (start, end, count) => `${start} - ${end} (${count} fois)`,
    dayOf: (day) => `le ${day}`,
  },
};

export const STRINGS: Record<AppLanguage, Strings> = { en, fr };
