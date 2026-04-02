import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import ErrorBoundaryPlaceholder from './ErrorBoundaryPlaceholder.svelte';
import LoadingPlaceholder from './LoadingPlaceholder.svelte';

describe('app-shell state placeholder components', () => {
  it('renders loading placeholder content with polite live region', () => {
    const { body } = render(LoadingPlaceholder);

    expect(body).toContain('data-testid="loading-placeholder"');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('<h2>Lade...</h2>');
    expect(body).toContain('<p>Dein mobiler Arbeitsplatz wird vorbereitet.</p>');
  });

  it('renders default error placeholder message in assertive alert region', () => {
    const { body } = render(ErrorBoundaryPlaceholder);

    expect(body).toContain('data-testid="error-placeholder"');
    expect(body).toContain('role="alert"');
    expect(body).toContain('aria-live="assertive"');
    expect(body).toContain('<h2>Error Placeholder</h2>');
    expect(body).toContain('<p>A section failed to render. Try selecting another tab.</p>');
  });

  it('renders a custom error placeholder message', () => {
    const customMessage = 'Unable to render app shell state.';
    const { body } = render(ErrorBoundaryPlaceholder, {
      props: { message: customMessage },
    });

    expect(body).toContain(`<p>${customMessage}</p>`);
  });
});
