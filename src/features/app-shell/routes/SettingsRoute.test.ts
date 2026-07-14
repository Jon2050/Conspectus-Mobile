// Guards the SettingsRoute theme contract for destructive/error surfaces in light and dark mode.
import { describe, expect, it } from 'vitest';
import settingsRouteSource from './SettingsRoute.svelte?raw';

describe('SettingsRoute styling', () => {
  it('renders dedicated metadata and risk-grouped action sections', () => {
    expect(settingsRouteSource).toContain('data-testid="settings-last-sync"');
    expect(settingsRouteSource).toContain('data-testid="standard-settings-actions"');
    expect(settingsRouteSource).toContain('data-testid="destructive-settings-actions"');
    expect(settingsRouteSource).toContain('data-testid="settings-build-information"');
    expect(settingsRouteSource).toContain('data-testid="settings-build-version"');
    expect(settingsRouteSource).toContain('data-testid="settings-build-time"');
    expect(settingsRouteSource).toContain('data-testid="force-refresh-button"');
    expect(settingsRouteSource).toContain('data-testid="force-refresh-status"');
    expect(settingsRouteSource).toContain('onForceRefresh');
    expect(settingsRouteSource.indexOf('settings-build-information')).toBeGreaterThan(
      settingsRouteSource.indexOf('destructive-settings-actions'),
    );
  });

  it('uses theme-aware custom properties for destructive settings surfaces', () => {
    expect(settingsRouteSource).toContain('--settings-error-color:');
    expect(settingsRouteSource).toContain('--settings-error-surface:');
    expect(settingsRouteSource).toContain('--settings-dialog-border:');
    expect(settingsRouteSource).toContain('color: var(--settings-error-color);');
    expect(settingsRouteSource).toContain('background: var(--settings-error-surface);');
    expect(settingsRouteSource).toContain('background: var(--surface-strong);');
    expect(settingsRouteSource).toContain('border: 1px solid var(--settings-dialog-border);');
    expect(settingsRouteSource).not.toContain('color: #991b1b;');
    expect(settingsRouteSource).not.toContain('background: #fef2f2;');
    expect(settingsRouteSource).not.toContain('color: #7d1111;');
  });
});
