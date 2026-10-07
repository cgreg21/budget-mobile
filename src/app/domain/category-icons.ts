/*
 * domain/category-icons.ts — the icon of a category is stored as the desktop
 * app does: a symbolic icon name (`emoji-food-symbolic`, `tabler:car`…), so the
 * two applications share the very same `categories.json`. Each name is drawn
 * on the phone with a glyph of the Material Design Icons font.
 *
 * Categories saved by earlier versions hold an emoji instead; those are
 * converted to the matching name when loaded.
 */
import { DEFAULT_CATEGORY_ICON, type Category } from './category'
import { glyph, type IconName } from './icons'

export interface CategoryIconChoice {
  /** The value stored in the category (and in `categories.json`). */
  name: string
  /** The glyph that draws it. */
  icon: IconName
  /** The emoji older versions stored for it. */
  legacyEmoji: string
}

export const CATEGORY_ICON_CHOICES: readonly CategoryIconChoice[] = [
  { name: 'emoji-food-symbolic', icon: 'food', legacyEmoji: '\u{1F6D2}' },
  { name: 'user-home-symbolic', icon: 'home', legacyEmoji: '\u{1F3E0}' },
  { name: 'thunderbolt-symbolic', icon: 'flash', legacyEmoji: '\u26A1' },
  { name: 'weather-showers-symbolic', icon: 'water', legacyEmoji: '\u{1F4A7}' },
  { name: 'night-light-symbolic', icon: 'fire', legacyEmoji: '\u{1F525}' },
  { name: 'applications-engineering-symbolic', icon: 'wrench', legacyEmoji: '\u{1F527}' },
  { name: 'emoji-travel-symbolic', icon: 'car', legacyEmoji: '\u{1F697}' },
  { name: 'airplane-mode-symbolic', icon: 'airplane', legacyEmoji: '\u2708' },
  { name: 'find-location-symbolic', icon: 'map-marker', legacyEmoji: '\u{1F4CD}' },
  { name: 'emoji-activities-symbolic', icon: 'soccer', legacyEmoji: '\u{1F3AE}' },
  { name: 'applications-games-symbolic', icon: 'gamepad-variant', legacyEmoji: '\u{1F579}' },
  { name: 'folder-music-symbolic', icon: 'music', legacyEmoji: '\u{1F3B5}' },
  { name: 'audio-headphones-symbolic', icon: 'headphones', legacyEmoji: '\u{1F3A7}' },
  { name: 'camera-photo-symbolic', icon: 'camera', legacyEmoji: '\u{1F4F7}' },
  { name: 'tv-symbolic', icon: 'television', legacyEmoji: '\u{1F4FA}' },
  { name: 'media-optical-symbolic', icon: 'disc', legacyEmoji: '\u{1F4BF}' },
  { name: 'emote-love-symbolic', icon: 'heart', legacyEmoji: '\u2764' },
  { name: 'emoji-body-symbolic', icon: 'run', legacyEmoji: '\u{1F3C3}' },
  { name: 'security-high-symbolic', icon: 'shield-check', legacyEmoji: '\u{1F6E1}' },
  { name: 'value-increase-symbolic', icon: 'trending-up', legacyEmoji: '\u{1F4B0}' },
  { name: 'value-decrease-symbolic', icon: 'trending-down', legacyEmoji: '\u{1F4B8}' },
  { name: 'accessories-calculator-symbolic', icon: 'calculator', legacyEmoji: '\u{1F9EE}' },
  { name: 'package-x-generic-symbolic', icon: 'package-variant-closed', legacyEmoji: '\u{1F4E6}' },
  { name: 'x-office-spreadsheet-symbolic', icon: 'file-table', legacyEmoji: '\u{1F4CA}' },
  { name: 'x-office-document-symbolic', icon: 'file-document', legacyEmoji: '\u{1F4C4}' },
  { name: 'mail-send-symbolic', icon: 'email', legacyEmoji: '\u2709' },
  { name: 'x-office-calendar-symbolic', icon: 'calendar', legacyEmoji: '\u{1F4C5}' },
  { name: 'web-browser-symbolic', icon: 'web', legacyEmoji: '\u{1F310}' },
  { name: 'network-wireless-symbolic', icon: 'wifi', legacyEmoji: '\u{1F4F6}' },
  { name: 'phone-symbolic', icon: 'phone', legacyEmoji: '\u{1F4F1}' },
  { name: 'computer-symbolic', icon: 'laptop', legacyEmoji: '\u{1F4BB}' },
  { name: 'accessories-dictionary-symbolic', icon: 'book-open-page-variant', legacyEmoji: '\u{1F4D6}' },
  { name: 'user-bookmarks-symbolic', icon: 'bookmark', legacyEmoji: '\u{1F516}' },
  { name: 'system-users-symbolic', icon: 'account-group', legacyEmoji: '\u{1F46A}' },
  { name: 'avatar-default-symbolic', icon: 'account', legacyEmoji: '\u{1F464}' },
  { name: 'emoji-nature-symbolic', icon: 'leaf', legacyEmoji: '\u{1F33F}' },
  { name: 'weather-clear-symbolic', icon: 'weather-sunny', legacyEmoji: '\u2600' },
  { name: 'starred-symbolic', icon: 'star', legacyEmoji: '\u2B50' },
  { name: 'emblem-important-symbolic', icon: 'alert-circle', legacyEmoji: '\u2757' },
  { name: 'folder-symbolic', icon: 'folder', legacyEmoji: '\u{1F4C1}' },
  { name: 'tabler:car', icon: 'car-side', legacyEmoji: '\u{1F699}' },
  { name: 'tabler:bicycle', icon: 'bike', legacyEmoji: '\u{1F6B2}' },
  { name: 'tabler:bus', icon: 'bus', legacyEmoji: '\u{1F68C}' },
  { name: 'tabler:train', icon: 'train', legacyEmoji: '\u{1F686}' },
  { name: 'tabler:map', icon: 'map', legacyEmoji: '\u{1F5FA}' },
  { name: 'tabler:pin', icon: 'pin', legacyEmoji: '\u{1F4CC}' },
  { name: 'tabler:shopping-cart', icon: 'cart', legacyEmoji: '\u{1F6CD}' },
  { name: 'tabler:basket', icon: 'basket', legacyEmoji: '\u{1F9FA}' },
  { name: 'tabler:tag', icon: 'tag', legacyEmoji: '\u{1F3F7}' },
  { name: 'tabler:wallet', icon: 'wallet', legacyEmoji: '\u{1F45B}' },
  { name: 'tabler:bank', icon: 'bank', legacyEmoji: '\u{1F3E6}' },
  { name: 'tabler:folder', icon: 'folder-outline', legacyEmoji: '\u{1F5C2}' },
  { name: 'tabler:folder-down', icon: 'folder-download', legacyEmoji: '\u{1F4E5}' },
  { name: 'tabler:folder-pictures', icon: 'folder-image', legacyEmoji: '\u{1F5BC}' },
  { name: 'tabler:folder-videos', icon: 'video-box', legacyEmoji: '\u{1F39E}' },
  { name: 'tabler:video', icon: 'video', legacyEmoji: '\u{1F3A5}' },
  { name: 'tabler:microphone', icon: 'microphone', legacyEmoji: '\u{1F3A4}' },
  { name: 'tabler:printer', icon: 'printer', legacyEmoji: '\u{1F5A8}' },
  { name: 'tabler:alarm', icon: 'alarm', legacyEmoji: '\u23F0' },
  { name: 'tabler:clock', icon: 'clock-outline', legacyEmoji: '\u{1F552}' },
  { name: 'tabler:face-smile', icon: 'emoticon-happy-outline', legacyEmoji: '\u{1F642}' },
  { name: 'tabler:heart', icon: 'heart-outline', legacyEmoji: '\u{1F497}' },
  { name: 'tabler:trash', icon: 'trash-can-outline', legacyEmoji: '\u{1F5D1}' },
]

// The emoji presentation selector is optional when typing, so it is ignored when comparing.
const bare = (emoji: string): string => emoji.replace(/\uFE0F/g, '')

const BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((choice) => [choice.name, choice]))
const BY_EMOJI = new Map(CATEGORY_ICON_CHOICES.map((choice) => [bare(choice.legacyEmoji), choice]))

/**
 * The stored form of an icon: known names stay, legacy emoji become their name,
 * other emoji fall back to the default icon, and unknown plain names (a custom
 * icon of the desktop theme) are kept so that the shared file is left untouched.
 */
export function normalizeCategoryIcon(icon: string): string {
  if (BY_NAME.has(icon)) return icon
  const legacy = BY_EMOJI.get(bare(icon))
  if (legacy) return legacy.name
  return /^[\x20-\x7E]+$/.test(icon) ? icon : DEFAULT_CATEGORY_ICON
}

/** The glyph drawing a stored icon; unknown names are drawn as the default folder. */
export function categoryGlyph(icon: string): string {
  const choice = BY_NAME.get(normalizeCategoryIcon(icon)) ?? BY_NAME.get(DEFAULT_CATEGORY_ICON)
  return glyph((choice as CategoryIconChoice).icon)
}

export const normalizeCategoryIcons = (list: readonly Category[]): Category[] =>
  list.map((category) => ({ name: category.name, icon: normalizeCategoryIcon(category.icon) }))
