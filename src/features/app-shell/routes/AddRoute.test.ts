// Verifies the Add Transfer form renders all MVP fields with correct attributes and classes.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import AddRoute from './AddRoute.svelte';

describe('AddRoute component', () => {
  it('renders the route container with the add route testid', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="route-add"');
  });

  it('renders the bottom sheet dialog with the form title', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('<dialog');
    expect(body).toContain('aria-modal="true"');
  });

  it('renders the add transfer form element', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-form"');
    expect(body).toContain('<form');
  });

  it('renders the date field with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-date"');
    expect(body).toContain('type="date"');
    expect(body).toMatch(/id="add-transfer-date"[^>]*class="app-input"/);
  });

  it('renders the name field with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-name"');
    expect(body).toContain('type="text"');
    expect(body).toMatch(/id="add-transfer-name"[^>]*class="app-input"/);
  });

  it('renders the amount field with decimal inputmode and app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-amount"');
    expect(body).toContain('inputmode="decimal"');
    expect(body).toMatch(/id="add-transfer-amount"[^>]*class="app-input"/);
  });

  it('renders the from-account select with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-from-account"');
    expect(body).toMatch(/id="add-transfer-from-account"[^>]*class="app-input"/);
  });

  it('renders the to-account select with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-to-account"');
    expect(body).toMatch(/id="add-transfer-to-account"[^>]*class="app-input"/);
  });

  it('renders all three category selects with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-category-1"');
    expect(body).toContain('data-testid="add-transfer-category-2"');
    expect(body).toContain('data-testid="add-transfer-category-3"');
    expect(body).toMatch(/id="add-transfer-category-1"[^>]*class="app-input"/);
    expect(body).toMatch(/id="add-transfer-category-2"[^>]*class="app-input"/);
    expect(body).toMatch(/id="add-transfer-category-3"[^>]*class="app-input"/);
  });

  it('renders the buyplace field with app-input class', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-buyplace"');
    expect(body).toMatch(/id="add-transfer-buyplace"[^>]*class="app-input"/);
  });

  it('renders the submit button with primary styling', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-submit"');
    expect(body).toContain('app-button--primary');
    expect(body).toContain('Transfer speichern');
    expect(body).not.toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });

  it('renders a touch-friendly close action inside the sheet', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('data-testid="add-transfer-close"');
    expect(body).toContain('app-button--secondary');
    expect(body).toContain('Schließen');
  });

  it('renders the category icon affordance', () => {
    const { body } = render(AddRoute);

    expect(body).toContain('category_55.png');
    expect(body).toMatch(/<img[^>]*category_55\.png/);
  });

  it('renders account select placeholder options when no options are provided', () => {
    const { body } = render(AddRoute);

    // Default empty options: only placeholder option should be rendered for each select
    const fromSelectMatch = body.match(/data-testid="add-transfer-from-account"[\s\S]*?<\/select>/);
    expect(fromSelectMatch).not.toBeNull();
    expect(fromSelectMatch![0]).toContain('<option');

    const toSelectMatch = body.match(/data-testid="add-transfer-to-account"[\s\S]*?<\/select>/);
    expect(toSelectMatch).not.toBeNull();
    expect(toSelectMatch![0]).toContain('<option');
  });

  it('renders provided account options in the from-account select', () => {
    const { body } = render(AddRoute, {
      props: {
        fromAccountOptions: [
          { accountId: 10, name: 'Checking' },
          { accountId: 20, name: 'Savings' },
        ],
      },
    });

    expect(body).toContain('Checking');
    expect(body).toContain('Savings');
  });

  it('renders provided category options in the category selects', () => {
    const { body } = render(AddRoute, {
      props: {
        categoryOptions: [
          { categoryId: 1, name: 'Food' },
          { categoryId: 2, name: 'Travel' },
        ],
      },
    });

    // Each category option appears 3 times (once per select)
    const foodMatches = body.match(/Food/g);
    expect(foodMatches).not.toBeNull();
    expect(foodMatches!.length).toBe(3);
  });

  it('uses app-input on every editable form control', () => {
    const { body } = render(AddRoute);
    const controlTestIds = [
      'add-transfer-date',
      'add-transfer-name',
      'add-transfer-amount',
      'add-transfer-from-account',
      'add-transfer-to-account',
      'add-transfer-category-1',
      'add-transfer-category-2',
      'add-transfer-category-3',
      'add-transfer-buyplace',
    ];

    for (const testId of controlTestIds) {
      const controlMatch = body.match(
        new RegExp(`<(?:input|select)[^>]*data-testid="${testId}"[^>]*>`),
      );
      expect(controlMatch, `${testId} should render`).not.toBeNull();
      expect(controlMatch![0], `${testId} should use app-input`).toContain('class="app-input"');
    }
  });

  it('renders a form-level loading state and disables controls while submitting', () => {
    const { body } = render(AddRoute, {
      props: {
        isSubmitting: true,
      },
    });

    expect(body).toContain('aria-busy="true"');
    expect(body).toContain('Transfer wird gespeichert...');
    expect(body).toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-name"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-buyplace"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-close"[^>]*disabled/);
  });

  it('renders a form-level error without disabling normal editing', () => {
    const { body } = render(AddRoute, {
      props: {
        formError: 'Unable to save the transfer yet.',
      },
    });

    expect(body).toContain('data-testid="add-transfer-form-error"');
    expect(body).toContain('role="alert"');
    expect(body).toContain('Unable to save the transfer yet.');
    expect(body).not.toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });
});
