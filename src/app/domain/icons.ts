/*
 * domain/icons.ts — the monochrome "symbolic" icons of the app, drawn with the
 * Material Design Icons font bundled in `src/fonts`. Only the glyphs in use are
 * listed here, as code points.
 */

const MDI_CODE_POINTS = {
  food: 0xF025A, home: 0xF02DC, flash: 0xF0241, water: 0xF058C, fire: 0xF0238, wrench: 0xF05B7,
  car: 0xF010B, airplane: 0xF001D, 'map-marker': 0xF034E, soccer: 0xF04B8, 'gamepad-variant': 0xF0297,
  music: 0xF075A, headphones: 0xF02CB, camera: 0xF0100, television: 0xF0502, disc: 0xF05EE,
  heart: 0xF02D1, run: 0xF070E, 'shield-check': 0xF0565, 'trending-up': 0xF0535, 'trending-down': 0xF0533,
  calculator: 0xF00EC, 'package-variant-closed': 0xF03D7, 'file-table': 0xF0C7E, 'file-document': 0xF0219,
  email: 0xF01EE, calendar: 0xF00ED, web: 0xF059F, wifi: 0xF05A9, phone: 0xF03F2, laptop: 0xF0322,
  'book-open-page-variant': 0xF05DA, bookmark: 0xF00C0, 'account-group': 0xF0849, account: 0xF0004,
  leaf: 0xF032A, 'weather-sunny': 0xF0599, star: 0xF04CE, 'alert-circle': 0xF0028, folder: 0xF024B,
  'car-side': 0xF07AB, bike: 0xF00A3, bus: 0xF00E7, train: 0xF052C, map: 0xF034D, pin: 0xF0403,
  cart: 0xF0110, basket: 0xF0076, tag: 0xF04F9, wallet: 0xF0584, bank: 0xF0070,
  'folder-outline': 0xF0256, 'folder-download': 0xF024D, 'folder-image': 0xF024F, 'video-box': 0xF00FD,
  video: 0xF0567, microphone: 0xF036C, printer: 0xF042A, alarm: 0xF0020, 'clock-outline': 0xF0150,
  'emoticon-happy-outline': 0xF01F5, 'heart-outline': 0xF02D5, 'trash-can-outline': 0xF0A7A,
  'cog-outline': 0xF08BB, 'chart-pie': 0xF012B, 'tune-variant': 0xF1542, 'cloud-check-outline': 0xF1BEC,
  'cloud-off-outline': 0xF0164, 'cloud-alert-outline': 0xF1BE0, sync: 0xF04E6, 'chevron-left': 0xF0141,
  'chevron-right': 0xF0142, 'chevron-double-left': 0xF013D, 'chevron-double-right': 0xF013E,
  history: 0xF02DA, repeat: 0xF0456, 'delete-outline': 0xF09E7, menu: 0xF035C, 'format-list-bulleted': 0xF0279,
  'checkbox-marked': 0xF0132, 'checkbox-blank-outline': 0xF0131, plus: 0xF0415,
} as const

export type IconName = keyof typeof MDI_CODE_POINTS

/** The text to put in a label using the `mdi` class to draw the icon. */
export function glyph(name: IconName): string {
  return String.fromCodePoint(MDI_CODE_POINTS[name])
}

/** Icons of the interface itself (as opposed to the category icons). */
export const UI_ICONS = {
  settings: glyph('cog-outline'),
  stats: glyph('chart-pie'),
  filters: glyph('tune-variant'),
  previous: glyph('chevron-left'),
  next: glyph('chevron-right'),
  previousYear: glyph('chevron-double-left'),
  nextYear: glyph('chevron-double-right'),
  remove: glyph('delete-outline'),
  repeat: glyph('repeat'),
  syncing: glyph('sync'),
  cloudOk: glyph('cloud-check-outline'),
  cloudOffline: glyph('cloud-off-outline'),
  cloudError: glyph('cloud-alert-outline'),
  menu: glyph('menu'),
  transactions: glyph('format-list-bulleted'),
  categories: glyph('tag'),
  history: glyph('history'),
  calendar: glyph('calendar'),
  checked: glyph('checkbox-marked'),
  unchecked: glyph('checkbox-blank-outline'),
  add: glyph('plus'),
} as const
