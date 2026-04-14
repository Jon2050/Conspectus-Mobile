import { addMessages, init, getLocaleFromNavigator } from 'svelte-i18n';
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
