// Verifies the persistent update banner's hidden, actionable, busy, and retry states.
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

import { createServiceWorkerUpdateController } from '../serviceWorkerUpdateController';
import ServiceWorkerUpdateBanner from './ServiceWorkerUpdateBanner.svelte';

describe('ServiceWorkerUpdateBanner component', () => {
  it('stays hidden until a service worker update is available', () => {
    const { body } = render(ServiceWorkerUpdateBanner, {
      props: { updateController: createServiceWorkerUpdateController() },
    });

    expect(body).not.toContain('data-testid="service-worker-update-banner"');
  });

  it('renders a persistent accessible update action', () => {
    const updateController = createServiceWorkerUpdateController();
    updateController.notifyUpdateAvailable();

    const { body } = render(ServiceWorkerUpdateBanner, { props: { updateController } });

    expect(body).toContain('data-testid="service-worker-update-banner"');
    expect(body).toContain('role="status"');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('data-testid="service-worker-update-button"');
    expect(body).toContain('type="button"');
    expect(body).not.toContain('disabled');
  });

  it('disables duplicate activation while the waiting worker takes control', () => {
    const updateController = createServiceWorkerUpdateController();
    updateController.setUpdater(() => new Promise<void>(() => {}));
    updateController.notifyUpdateAvailable();
    void updateController.acceptUpdate();

    const { body } = render(ServiceWorkerUpdateBanner, { props: { updateController } });

    expect(body).toContain('aria-busy="true"');
    expect(body).toContain('disabled');
  });

  it('keeps a failed update visible with an alert and retry action', async () => {
    const updateController = createServiceWorkerUpdateController();
    updateController.setUpdater(vi.fn().mockRejectedValue(new Error('failed')));
    updateController.notifyUpdateAvailable();
    await updateController.acceptUpdate();

    const { body } = render(ServiceWorkerUpdateBanner, { props: { updateController } });

    expect(body).toContain('data-testid="service-worker-update-error"');
    expect(body).toContain('role="alert"');
    expect(body).not.toContain('disabled');
  });
});
