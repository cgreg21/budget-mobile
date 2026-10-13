import { DEFAULT_CATEGORY_ICON } from 'budget-lib';
import { describe, expect, it } from 'vitest';

import { categoryGlyph, glyph, UI_ICONS } from '~/app/shared/icons';
import { pageTransition, pushTransition } from '~/app/shared/page-transition';

describe('icons', () => {
  it('maps icon names to single MDI code points in the private use area', () => {
    const text = glyph('wallet');
    expect([...text]).toHaveLength(1);
    expect(text.codePointAt(0)).toBe(0xF0584);
    expect(UI_ICONS.logo).toBe(text);
    for (const value of Object.values(UI_ICONS)) expect([...value]).toHaveLength(1);
  });

  it('draws category icons by their symbolic or tabler name', () => {
    expect(categoryGlyph('emoji-food-symbolic')).toBe(glyph('food'));
    expect(categoryGlyph('tabler:bus')).toBe(glyph('bus'));
    expect(categoryGlyph(DEFAULT_CATEGORY_ICON)).toBe(glyph('folder'));
  });

  it('falls back to the default icon for unknown and legacy emoji icons', () => {
    expect(categoryGlyph('no-such-icon')).toBe(categoryGlyph(DEFAULT_CATEGORY_ICON));
    // Emoji are normalised by budget-lib before the lookup.
    expect(categoryGlyph('\u{1F3E0}')).toBe(glyph('home'));
  });
});

describe('pageTransition', () => {
  it('slides left towards later pages and right towards earlier ones', () => {
    expect(pageTransition('/budget', '/stats').name).toBe('slideLeft');
    expect(pageTransition('/history', '/categories').name).toBe('slideRight');
    expect(pageTransition('/budget', '/stats').curve).toBe('easeInOut');
  });

  it('fades when a page is unknown', () => {
    expect(pageTransition('/budget', '/nowhere')).toEqual({ name: 'fade', duration: 250 });
    expect(pageTransition('/nowhere', '/budget').name).toBe('fade');
  });

  it('pushes sub-pages from the right', () => {
    expect(pushTransition.name).toBe('slideLeft');
  });
});
