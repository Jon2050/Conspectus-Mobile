// Verifies app locale bootstrap helpers that affect document-level accessibility metadata.
import { afterEach, describe, expect, it } from 'vitest';
import { locale } from 'svelte-i18n';
import { syncRootDocumentLanguage, toRootDocumentLanguage } from './index';

describe('i18n document language sync', () => {
  afterEach(() => {
    locale.set('de');
  });

  it('normalizes active locales for the root document language attribute', () => {
    expect(toRootDocumentLanguage('de')).toBe('de');
    expect(toRootDocumentLanguage('en-US')).toBe('en');
    expect(toRootDocumentLanguage(null)).toBe('de');
    expect(toRootDocumentLanguage(undefined)).toBe('de');
  });

  it('keeps documentElement.lang aligned with the active app locale', () => {
    const documentRef = { documentElement: { lang: 'en' } };
    const unsubscribe = syncRootDocumentLanguage(documentRef);

    expect(documentRef.documentElement.lang).toBe('de');

    locale.set('en');
    expect(documentRef.documentElement.lang).toBe('en');

    locale.set('de');
    expect(documentRef.documentElement.lang).toBe('de');

    unsubscribe();
  });
});
