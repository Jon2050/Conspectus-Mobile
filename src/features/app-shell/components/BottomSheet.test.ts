// Verifies the bottom-sheet dialog renders with native modal semantics.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import BottomSheet from './BottomSheet.svelte';

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

  it('renders the dialog without a static open attribute or sibling backdrop markup', () => {
    const { body } = render(BottomSheet, {
      props: {
        isOpen: true,
        title: 'Add transfer',
      },
    });

    expect(body).toContain('<dialog');
    expect(body).toContain('aria-modal="true"');
    expect(body).toContain('>Add transfer</h3>');
    expect(body).not.toMatch(/<dialog[^>]*\sopen(?:[\s=>])/);
    expect(body).not.toContain('bottom-sheet__backdrop');
  });
});
