export const supportedLocales = [
  'te',
  'hi',
  'en',
  'ta',
  'kn',
  'ml',
  'bn',
  'mr',
] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = 'te';

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.some((locale) => locale === value);
}
