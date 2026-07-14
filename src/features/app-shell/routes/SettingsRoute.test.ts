// Guards the SettingsRoute theme contract for destructive/error surfaces in light and dark mode.
import { describe, expect, it } from 'vitest';
import settingsRouteSource from './SettingsRoute.svelte?raw';

describe('SettingsRoute styling', () => {
  it('renders dedicated metadata and risk-grouped action sections', () => {
    expect(settingsRouteSource).toContain('data-testid="settings-safety-recovery"');
    expect(settingsRouteSource).toContain("$_('settings.safety.warning')");
    expect(settingsRouteSource).toContain("$_('settings.safety.recoveryDescription')");
    expect(settingsRouteSource).toContain(
      'https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive',
    );
    expect(settingsRouteSource).toContain('target="_blank"');
    expect(settingsRouteSource).toContain('rel="noopener noreferrer"');
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

  it('uses theme tokens for the safety notice', () => {
    expect(settingsRouteSource).toContain('border-left: 0.3rem solid var(--negative);');
    expect(settingsRouteSource).toContain(
      'background: color-mix(in srgb, var(--negative) 8%, var(--surface-strong));',
    );
    expect(settingsRouteSource).toContain('min-height: 2.75rem;');
    expect(settingsRouteSource).toContain('color: var(--text-primary);');
    expect(settingsRouteSource).toContain('text-decoration-color: var(--accent);');
  });
});
