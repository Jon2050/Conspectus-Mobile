// Verifies the bottom-sheet dialog renders with native modal semantics.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import BottomSheet from './BottomSheet.svelte';
import BottomSheetTestHost from './BottomSheetTestHost.svelte';

describe('BottomSheet component', () => {
  it('does not render when closed', () => {
    const { body } = render(BottomSheet, {
      props: {
        isOpen: false,
        title: 'Add transfer',
      },
    });

    expect(body).not.toContain('<dialog');
  });

  it('uses its visible title as the dialog accessible name', () => {
    const { body } = render(BottomSheet, {
      props: {
        isOpen: true,
        title: 'Add transfer',
      },
    });

    expect(body).toContain('<dialog');
    expect(body).toContain('aria-modal="true"');
    const titleId = body.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(titleId).toMatch(/^bottom-sheet-title-/);
    expect(body).toContain(`<h3 id="${titleId}"`);
    expect(body).not.toMatch(/<dialog[^>]*\sopen(?:[\s=>])/);
    expect(body).not.toContain('bottom-sheet__backdrop');
  });

  it('uses the supplied fallback label when no title is available', () => {
    const { body } = render(BottomSheet, {
      props: {
        isOpen: true,
        ariaLabel: 'Transfer options',
      },
    });

    expect(body).toContain('aria-label="Transfer options"');
    expect(body).not.toContain('aria-labelledby');
  });

  it('assigns distinct accessible-name references to concurrent sheets', () => {
    const { body } = render(BottomSheetTestHost);
    const titleIds = Array.from(body.matchAll(/aria-labelledby="([^"]+)"/g), (match) => match[1]);

    expect(titleIds).toHaveLength(2);
    expect(new Set(titleIds).size).toBe(2);
    for (const titleId of titleIds) {
      expect(body).toContain(`<h3 id="${titleId}"`);
    }
  });
});
