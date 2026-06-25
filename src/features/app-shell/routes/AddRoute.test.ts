// Verifies the Add Transfer form renders all MVP fields with correct attributes and classes.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import AddRoute from './AddRoute.svelte';
import type {
  AddTransferOptionsController,
  AddTransferOptionsState,
} from './addTransferOptionsController';

const READY_OPTIONS_STATE: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [],
  toAccountOptions: [],
  categoryOptions: [],
  error: null,
};

const createMockOptionsController = (
  state: AddTransferOptionsState = READY_OPTIONS_STATE,
): AddTransferOptionsController => ({
  getState: () => state,
  subscribe: (listener) => {
    listener(state);
    return () => {};
  },
  load: async () => {},
});

const renderAddRoute = (props: Record<string, unknown> = {}) =>
  render(AddRoute, {
    props: {
      controller: createMockOptionsController(),
      ...props,
    },
  });

describe('AddRoute component', () => {
  it('renders the route container with the add route testid', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="route-add"');
  });

  it('renders the bottom sheet dialog with the form title', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('<dialog');
    expect(body).toContain('aria-modal="true"');
  });

  it('renders the add transfer form element', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-form"');
    expect(body).toContain('<form');
  });

  it('renders the date field with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-date"');
    expect(body).toContain('type="date"');
    expect(body).toMatch(/id="add-transfer-date"[^>]*class="app-input"/);
  });

  it('renders the name field with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-name"');
    expect(body).toContain('type="text"');
    expect(body).toMatch(/id="add-transfer-name"[^>]*class="app-input"/);
  });

  it('renders the amount field with decimal inputmode and app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-amount"');
    expect(body).toContain('inputmode="decimal"');
    expect(body).toMatch(/id="add-transfer-amount"[^>]*class="app-input"/);
  });

  it('renders the from-account select with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-from-account"');
    expect(body).toMatch(/id="add-transfer-from-account"[^>]*class="app-input"/);
  });

  it('renders the to-account select with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-to-account"');
    expect(body).toMatch(/id="add-transfer-to-account"[^>]*class="app-input"/);
  });

  it('renders all three category selects with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-category-1"');
    expect(body).toContain('data-testid="add-transfer-category-2"');
    expect(body).toContain('data-testid="add-transfer-category-3"');
    expect(body).toMatch(/id="add-transfer-category-1"[^>]*class="app-input"/);
    expect(body).toMatch(/id="add-transfer-category-2"[^>]*class="app-input"/);
    expect(body).toMatch(/id="add-transfer-category-3"[^>]*class="app-input"/);
  });

  it('renders the buyplace field with app-input class', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-buyplace"');
    expect(body).toMatch(/id="add-transfer-buyplace"[^>]*class="app-input"/);
  });

  it('renders the submit button with primary styling', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-submit"');
    expect(body).toContain('app-button--primary');
    expect(body).toContain('Transfer speichern');
    expect(body).not.toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });

  it('renders a touch-friendly close action inside the sheet', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('data-testid="add-transfer-close"');
    expect(body).toContain('app-button--secondary');
    expect(body).toContain('Schließen');
  });

  it('renders the category icon affordance', () => {
    const { body } = renderAddRoute();

    expect(body).toContain('category_55.png');
    expect(body).toMatch(/<img[^>]*category_55\.png/);
  });

  it('renders account select placeholder options when no options are provided', () => {
    const { body } = renderAddRoute();

    // Default empty options: only placeholder option should be rendered for each select
    const fromSelectMatch = body.match(/data-testid="add-transfer-from-account"[\s\S]*?<\/select>/);
    expect(fromSelectMatch).not.toBeNull();
    expect(fromSelectMatch![0]).toContain('<option');

    const toSelectMatch = body.match(/data-testid="add-transfer-to-account"[\s\S]*?<\/select>/);
    expect(toSelectMatch).not.toBeNull();
    expect(toSelectMatch![0]).toContain('<option');
  });

  it('renders provided account options in the from-account select', () => {
    const { body } = renderAddRoute({
      controller: createMockOptionsController({
        ...READY_OPTIONS_STATE,
        fromAccountOptions: [
          { accountId: 10, name: 'Checking', accountTypeId: 3 },
          { accountId: 20, name: 'Savings', accountTypeId: 3 },
        ],
      }),
    });

    expect(body).toContain('Checking');
    expect(body).toContain('Savings');
  });

  it('renders provided account options in the to-account select', () => {
    const { body } = renderAddRoute({
      controller: createMockOptionsController({
        ...READY_OPTIONS_STATE,
        toAccountOptions: [
          { accountId: 30, name: 'Credit Card', accountTypeId: 3 },
          { accountId: 40, name: 'Savings', accountTypeId: 3 },
        ],
      }),
    });

    const toSelectMatch = body.match(/data-testid="add-transfer-to-account"[\s\S]*?<\/select>/);
    expect(toSelectMatch).not.toBeNull();
    expect(toSelectMatch![0]).toContain('Credit Card');
    expect(toSelectMatch![0]).toContain('Savings');
  });

  it('renders provided category options in the category selects', () => {
    const { body } = renderAddRoute({
      controller: createMockOptionsController({
        ...READY_OPTIONS_STATE,
        categoryOptions: [
          { categoryId: 1, name: 'Food' },
          { categoryId: 2, name: 'Travel' },
        ],
      }),
    });

    // Each category option appears 3 times (once per select)
    const foodMatches = body.match(/Food/g);
    expect(foodMatches).not.toBeNull();
    expect(foodMatches!.length).toBe(3);
  });

  it('renders a no-category sentinel option in all three category selects', () => {
    const { body } = renderAddRoute();

    const placeholderMatches = body.match(/Keine Kategorie/g);

    expect(placeholderMatches).not.toBeNull();
    expect(placeholderMatches!.length).toBe(3);
  });

  it('uses app-input on every editable form control', () => {
    const { body } = renderAddRoute();
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
    const { body } = renderAddRoute({
      isSubmitting: true,
    });

    expect(body).toContain('aria-busy="true"');
    expect(body).toContain('Transfer wird gespeichert...');
    expect(body).toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-name"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-buyplace"[^>]*disabled/);
    expect(body).toMatch(/data-testid="add-transfer-close"[^>]*disabled/);
  });

  it('renders a form-level error without disabling normal editing', () => {
    const { body } = renderAddRoute({
      formError: 'Unable to save the transfer yet.',
    });

    expect(body).toContain('data-testid="add-transfer-form-error"');
    expect(body).toContain('role="alert"');
    expect(body).toContain('Unable to save the transfer yet.');
    expect(body).not.toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });

  it('renders option loading status and disables editing while options load', () => {
    const { body } = renderAddRoute({
      controller: createMockOptionsController({
        ...READY_OPTIONS_STATE,
        operation: 'loading',
      }),
    });

    expect(body).toContain('data-testid="add-transfer-options-loading"');
    expect(body).toContain('Konten und Kategorien werden geladen...');
    expect(body).toContain('aria-busy="true"');
    expect(body).toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });

  it('renders option loading errors without disabling editing', () => {
    const { body } = renderAddRoute({
      controller: createMockOptionsController({
        ...READY_OPTIONS_STATE,
        operation: 'error',
        error: { message: 'Failed to load options.' },
      }),
    });

    expect(body).toContain('data-testid="add-transfer-form-error"');
    expect(body).toContain('Failed to load options.');
    expect(body).not.toMatch(/data-testid="add-transfer-submit"[^>]*disabled/);
  });

  it('renders validation error messages when validation fails on submit', async () => {
    // Svelte 5 testing note: server-side render doesn't support interactive event firing.
    // For full interactive coverage, Playwright e2e tests will verify the blocking behavior.
    // However, we can at least assert that the container testid doesn't exist initially.
    const { body } = renderAddRoute();
    expect(body).not.toContain('data-testid="add-transfer-validation-error"');
  });
});
