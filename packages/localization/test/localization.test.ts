import { describe, expect, it } from 'vitest';
import {
  defaultLocale,
  getTranslations,
  isSupportedLocale,
  supportedLocales,
} from '../src/index.js';

describe('localization', () => {
  it('identifies supported locales correctly', () => {
    expect(supportedLocales).toHaveLength(8);
    expect(isSupportedLocale('te')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('hi')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
  });

  it('provides complete translation dictionaries for all 8 supported languages', () => {
    for (const locale of supportedLocales) {
      const t = getTranslations(locale);
      expect(t.app.title).toBeTruthy();
      expect(t.projects.title).toBeTruthy();
      expect(t.projects.createProject).toBeTruthy();
      expect(t.documents.title).toBeTruthy();
      expect(t.common.loading).toBeTruthy();
    }
  });

  it('falls back to default Telugu locale on invalid query', () => {
    // @ts-expect-error test fallback
    const t = getTranslations('invalid');
    expect(t).toEqual(getTranslations(defaultLocale));
  });
});

