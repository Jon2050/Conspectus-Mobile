import { addMessages, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import en from './en.json';
import de from './de.json';

addMessages('en', en);
addMessages('de', de);

const getBestLocale = () => {
  if (typeof window === 'undefined') return 'de';
  const navLocale = getLocaleFromNavigator();
  if (navLocale && navLocale.startsWith('en')) return 'en';
  return 'de';
};

init({
  fallbackLocale: 'de',
  initialLocale: getBestLocale(),
});

interface RootLanguageDocument {
  readonly documentElement: {
    lang: string;
  };
}

export const toRootDocumentLanguage = (localeValue: string | null | undefined): string =>
  localeValue?.split('-')[0] || 'de';

export const syncRootDocumentLanguage = (
  documentRef: RootLanguageDocument | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): (() => void) => {
  if (documentRef === undefined) {
    return () => {};
  }

  return locale.subscribe((activeLocale) => {
    documentRef.documentElement.lang = toRootDocumentLanguage(activeLocale);
  });
};
