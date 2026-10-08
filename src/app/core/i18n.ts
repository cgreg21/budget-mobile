/*
 * core/i18n.ts - every piece of text the UI shows, in French and English.
 * `Strings` is the contract: both dictionaries implement it in full, so a
 * missing translation is a compile error rather than a blank label.
 */
import type { AppLanguage, RemoteState } from 'budget-lib';

export interface Strings {
  appName: string;
  nav: { transactions: string };
  common: {
    cancel: string; delete: string; save: string; add: string;
    expense: string; income: string; all: string; back: string;
    noDescription: string; ok: string;
  };
  frequency: { monthly: string; quarterly: string; yearly: string };
  months: string[];
  budget: {
    balance: string; income: string; expenses: string;
    searchPlaceholder: string; emptyTitle: string; emptyText: string;
    noMatch: string; recurringBadge: string;
    emptyRecurring: string; emptyOneOff: string; currentMonth: string;
    deleteTitle: string; deleteBody(details: string): string;
    deleteScopeBody: string; thisOccurrence: string; wholeSeries: string;
    categoryFilter: string; resetFilters: string; filters: string;
  };
  levels: { critical: string; low: string; medium: string; high: string };
  editor: {
    newTitle: string; editTitle: string; amount: string; description: string;
    category: string; repeat: string; frequency: string; limited: string;
    occurrences: string; invalidAmount: string; scopeTitle: string;
    scopeBody: string; occurrenceOnly: string; seriesToo: string;
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
    manage: string; recurrences: string; chooseOption: string;
  };
  sync: {
    title: string; help: string; server: string; username: string; password: string;
    passwordKept: string; remoteDir: string; enable: string; save: string; syncNow: string;
    states: Record<RemoteState, string>; offlineNote: string; never: string;
    lastSync(date: string): string; pending(count: number): string; passwordSession: string;
    provider: string; providerWebdav: string; providerIcloud: string; icloudHelp: string;
  };
  categories: {
    title: string; newName: string; exists(name: string): string;
    mustKeepOne: string; deleteBody(name: string): string; rename: string; pickIcon: string;
  };
  recurrences: {
    title: string; empty: string; deleteBody(name: string): string;
    from(month: string): string; range(start: string, end: string, count: number): string;
    dayOf(day: number): string;
  };
  bank: {
    title: string; help: string; keyWarning: string;
    applicationId: string; privateKey: string; privateKeyKept: string; saveCredentials: string; forget: string;
    bank: string; chooseBank: string; noBank: string; connect: string;
    redirectUrl: string; redirectHelp: string; importFrom: string; saveSettings: string;
    pasteTitle: string; pasteHint: string; pasteAction: string;
    importNow: string; disconnect: string; notConnectedStatus: string; connectedStatus(bank: string, accounts: number): string;
    validUntil(date: string): string; lastImport(date: string): string; never: string; renewNote: string;
    invalidDate: string; waitingForBank: string; refused(reason: string): string; unexpectedReturn: string;
    noCode: string; notConnected: string; expired: string; imported(count: number): string;
    missingCredentials: string; failed(message: string): string; network: string; rateLimit: string;
    authRefused(message: string): string;
  };
}

const en: Strings = {
  appName: 'Budget',
  nav: { transactions: 'Transactions' },
  common: {
    cancel: 'Cancel', delete: 'Delete', save: 'Save', add: 'Add',
    expense: 'Expense', income: 'Income', all: 'All', back: 'Back',
    noDescription: '(no description)', ok: 'OK',
  },
  frequency: { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' },
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'],
  budget: {
    balance: 'Balance', income: 'Income', expenses: 'Expenses',
    searchPlaceholder: 'Search...', emptyTitle: 'No transactions',
    emptyText: 'Tap + to add your first transaction of the month.',
    noMatch: 'No transaction matches these filters.', recurringBadge: 'recurring',
    currentMonth: 'Current month',
    emptyRecurring: 'No recurring transactions this month.', emptyOneOff: 'No one-off transactions this month.',
    deleteTitle: 'Delete transaction?',
    deleteBody: (details) => `${details} will be permanently deleted.`,
    deleteScopeBody: 'This transaction belongs to a recurring series.',
    thisOccurrence: 'This occurrence only', wholeSeries: 'Delete the whole series',
    categoryFilter: 'Category', resetFilters: 'Reset', filters: 'Filters',
  },
  levels: { critical: 'Critical', low: 'Low', medium: 'Medium', high: 'Comfortable' },
  editor: {
    newTitle: 'New transaction', editTitle: 'Edit transaction', amount: 'Amount',
    description: 'Description', category: 'Category', repeat: 'Repeat',
    frequency: 'Frequency', limited: 'Limit the number of occurrences',
    occurrences: 'Occurrences', invalidAmount: 'Enter an amount greater than zero.',
    scopeTitle: 'Apply the change to',
    scopeBody: 'This transaction is part of a recurring series.',
    occurrenceOnly: 'This occurrence only', seriesToo: 'The whole series',
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
    manage: 'Manage', recurrences: 'Recurring transactions',
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
    states: {
      disabled: 'Synchronisation off', connecting: 'Connecting…', syncing: 'Synchronising…',
      online: 'Up to date', offline: 'Offline', error: 'Error',
    },
    offlineNote: 'Changes are kept on this device and sent when the server is reachable.',
    never: 'never', lastSync: (date) => `Last synchronisation: ${date}`,
    pending: (count) => (count === 1 ? '1 change waiting' : `${count} changes waiting`),
    passwordSession: 'The password cannot be stored securely on this build; it will be asked again after a restart.',
  },
  categories: {
    title: 'Categories', newName: 'New category',
    exists: (name) => `The category "${name}" already exists.`,
    mustKeepOne: 'At least one category must remain.',
    deleteBody: (name) => `Delete "${name}"? Existing transactions keep it; only the list offered for new ones changes.`,
    rename: 'Rename', pickIcon: 'Change the icon',
  },
  recurrences: {
    title: 'Recurring transactions', empty: 'No recurring transaction yet. Enable "Repeat" when adding a transaction.',
    deleteBody: (name) => `Stop "${name}"? Occurrences already created stay in their months.`,
    from: (month) => `from ${month}`, range: (start, end, count) => `${start} - ${end} (${count} times)`,
    dayOf: (day) => `day ${day}`,
  },
  bank: {
    title: 'Bank',
    help: 'Imports the transactions of your bank account through Enable Banking (free for your own accounts). '
      + 'Register an application on enablebanking.com, link your accounts, then enter its identifier and private key here.',
    keyWarning: 'The private key is stored in this device\'s secure storage only. Never share it.',
    applicationId: 'Application identifier', privateKey: 'Private key (PEM)',
    privateKeyKept: 'A key is saved. Paste a new one to replace it.',
    saveCredentials: 'Save credentials', forget: 'Remove credentials',
    bank: 'Bank', chooseBank: 'Choose a bank', noBank: 'No bank found.', connect: 'Connect the bank',
    redirectUrl: 'Return address',
    redirectHelp: 'Must be registered in your Enable Banking application. If the app does not open by itself after the bank, '
      + 'copy the address shown by the browser into the field below.',
    importFrom: 'Import from (YYYY-MM-DD)', saveSettings: 'Save',
    pasteTitle: 'Finish the connection by hand', pasteHint: 'Address or code received from the bank',
    pasteAction: 'Validate',
    importNow: 'Import now', disconnect: 'Disconnect',
    notConnectedStatus: 'Not connected',
    connectedStatus: (bank, accounts) => `Connected to ${bank} (${accounts === 1 ? '1 account' : `${accounts} accounts`})`,
    validUntil: (date) => `Access valid until ${date}`, lastImport: (date) => `Last import: ${date}`, never: 'never',
    renewNote: 'The bank asks to renew the access about every 90 days. Imports are limited to a few per day.',
    invalidDate: 'Enter the date as YYYY-MM-DD.',
    waitingForBank: 'Finish the authorisation in the browser; the app will import the transactions when you come back.',
    refused: (reason) => `The bank refused the connection: ${reason}`,
    unexpectedReturn: 'This return does not match a connection started from this app. Start the connection again.',
    noCode: 'No authorisation code found.',
    notConnected: 'Connect a bank first.',
    expired: 'The access to the bank has expired. Connect the bank again.',
    imported: (count) => (count === 0 ? 'Up to date: no new transaction.' : count === 1 ? '1 transaction imported.' : `${count} transactions imported.`),
    missingCredentials: 'Enter the application identifier and the private key first.',
    failed: (message) => `The request failed: ${message}`,
    network: 'The bank service cannot be reached. Try again later.',
    rateLimit: 'Too many requests: the bank limits the number of imports per day. Try again later.',
    authRefused: (message) => `Access refused (check the identifier and the key): ${message}`,
  },
};

const fr: Strings = {
  appName: 'Budget',
  nav: { transactions: 'Transactions' },
  common: {
    cancel: 'Annuler', delete: 'Supprimer', save: 'Enregistrer', add: 'Ajouter',
    expense: 'Dépense', income: 'Revenu', all: 'Tout', back: 'Retour',
    noDescription: '(sans description)', ok: 'OK',
  },
  frequency: { monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' },
  months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
    'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  budget: {
    balance: 'Solde', income: 'Revenus', expenses: 'Dépenses',
    searchPlaceholder: 'Rechercher...', emptyTitle: 'Aucune transaction',
    emptyText: 'Appuyez sur + pour ajouter votre première transaction du mois.',
    noMatch: 'Aucune transaction ne correspond à ces filtres.', recurringBadge: 'récurrente',
    currentMonth: 'Mois en cours',
    emptyRecurring: 'Aucune transaction récurrente ce mois-ci.', emptyOneOff: 'Aucune transaction ponctuelle ce mois-ci.',
    deleteTitle: 'Supprimer la transaction ?',
    deleteBody: (details) => `${details} sera définitivement supprimée.`,
    deleteScopeBody: 'Cette transaction fait partie d’une série récurrente.',
    thisOccurrence: 'Cette occurrence uniquement', wholeSeries: 'Supprimer toute la série',
    categoryFilter: 'Catégorie', resetFilters: 'Réinitialiser', filters: 'Filtres',
  },
  levels: { critical: 'Critique', low: 'Faible', medium: 'Moyen', high: 'Confortable' },
  editor: {
    newTitle: 'Nouvelle transaction', editTitle: 'Modifier la transaction',
    amount: 'Montant', description: 'Description', category: 'Catégorie',
    repeat: 'Répéter', frequency: 'Fréquence', limited: "Limiter le nombre d'occurrences",
    occurrences: 'Occurrences', invalidAmount: 'Saisissez un montant supérieur à zéro.',
    scopeTitle: 'Appliquer la modification à',
    scopeBody: 'Cette transaction fait partie d’une série récurrente.',
    occurrenceOnly: 'Cette occurrence uniquement', seriesToo: 'Toute la série',
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
    manage: 'Gérer', recurrences: 'Transactions récurrentes',
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
    states: {
      disabled: 'Synchronisation désactivée', connecting: 'Connexion…', syncing: 'Synchronisation…',
      online: 'À jour', offline: 'Hors ligne', error: 'Erreur',
    },
    offlineNote: 'Les changements restent sur cet appareil et seront envoyés dès que le serveur sera joignable.',
    never: 'jamais', lastSync: (date) => `Dernière synchronisation : ${date}`,
    pending: (count) => (count === 1 ? '1 modification en attente' : `${count} modifications en attente`),
    passwordSession: 'Le mot de passe ne peut pas être stocké de façon sécurisée avec cette version ; il sera redemandé après un redémarrage.',
  },
  categories: {
    title: 'Catégories', newName: 'Nouvelle catégorie',
    exists: (name) => `La catégorie « ${name} » existe déjà.`,
    mustKeepOne: 'Il faut conserver au moins une catégorie.',
    deleteBody: (name) => `Supprimer « ${name} » ? Les transactions existantes la gardent ; seule la liste proposée à la saisie change.`,
    rename: 'Renommer', pickIcon: "Changer l'icône",
  },
  recurrences: {
    title: 'Transactions récurrentes', empty: 'Aucune transaction récurrente. Activez « Répéter » en ajoutant une transaction.',
    deleteBody: (name) => `Arrêter « ${name} » ? Les occurrences déjà créées restent dans leurs mois.`,
    from: (month) => `à partir de ${month}`, range: (start, end, count) => `${start} - ${end} (${count} fois)`,
    dayOf: (day) => `le ${day}`,
  },
  bank: {
    title: 'Banque',
    help: 'Importe les transactions de votre compte bancaire via Enable Banking (gratuit pour vos propres comptes). '
      + 'Créez une application sur enablebanking.com, liez vos comptes, puis saisissez ici son identifiant et sa clé privée.',
    keyWarning: 'La clé privée est conservée uniquement dans le stockage sécurisé de cet appareil. Ne la partagez jamais.',
    applicationId: 'Identifiant de l’application', privateKey: 'Clé privée (PEM)',
    privateKeyKept: 'Une clé est enregistrée. Collez-en une nouvelle pour la remplacer.',
    saveCredentials: 'Enregistrer les identifiants', forget: 'Supprimer les identifiants',
    bank: 'Banque', chooseBank: 'Choisir une banque', noBank: 'Aucune banque trouvée.', connect: 'Connecter la banque',
    redirectUrl: 'Adresse de retour',
    redirectHelp: 'Doit être déclarée dans votre application Enable Banking. Si l’app ne s’ouvre pas toute seule après la banque, '
      + 'copiez l’adresse affichée par le navigateur dans le champ ci-dessous.',
    importFrom: 'Importer à partir du (AAAA-MM-JJ)', saveSettings: 'Enregistrer',
    pasteTitle: 'Terminer la connexion à la main', pasteHint: 'Adresse ou code reçu de la banque',
    pasteAction: 'Valider',
    importNow: 'Importer maintenant', disconnect: 'Déconnecter',
    notConnectedStatus: 'Non connecté',
    connectedStatus: (bank, accounts) => `Connecté à ${bank} (${accounts === 1 ? '1 compte' : `${accounts} comptes`})`,
    validUntil: (date) => `Accès valable jusqu’au ${date}`, lastImport: (date) => `Dernier import : ${date}`, never: 'jamais',
    renewNote: 'La banque demande de renouveler l’accès environ tous les 90 jours. Les imports sont limités à quelques-uns par jour.',
    invalidDate: 'Saisissez la date au format AAAA-MM-JJ.',
    waitingForBank: 'Terminez l’autorisation dans le navigateur ; l’app importera les transactions à votre retour.',
    refused: (reason) => `La banque a refusé la connexion : ${reason}`,
    unexpectedReturn: 'Ce retour ne correspond à aucune connexion démarrée depuis l’app. Relancez la connexion.',
    noCode: 'Aucun code d’autorisation trouvé.',
    notConnected: 'Connectez d’abord une banque.',
    expired: 'L’accès à la banque a expiré. Connectez de nouveau la banque.',
    imported: (count) => (count === 0 ? 'À jour : aucune nouvelle transaction.' : count === 1 ? '1 transaction importée.' : `${count} transactions importées.`),
    missingCredentials: 'Saisissez d’abord l’identifiant de l’application et la clé privée.',
    failed: (message) => `La requête a échoué : ${message}`,
    network: 'Le service bancaire est injoignable. Réessayez plus tard.',
    rateLimit: 'Trop de requêtes : la banque limite le nombre d’imports par jour. Réessayez plus tard.',
    authRefused: (message) => `Accès refusé (vérifiez l’identifiant et la clé) : ${message}`,
  },
};

export const STRINGS: Record<AppLanguage, Strings> = { en, fr };
