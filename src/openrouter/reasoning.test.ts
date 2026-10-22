import { describe, expect, it } from 'vitest';
import { parseOpenRouterReasoningCapabilities, resolveOpenRouterReasoning } from './reasoning';

describe('gateway-declared reasoning controls', () => {
  it('selects the lowest supported effort regardless of metadata order and honors mandatory reasoning', () => {
    const capabilities = parseOpenRouterReasoningCapabilities({
      mandatory: true,
      supported_efforts: ['max', 'high', 'low'],
      default_effort: 'max',
    });
    expect(resolveOpenRouterReasoning(capabilities, 'lowest')).toEqual({
      enabled: true,
      effort: 'low',
    });
    expect(resolveOpenRouterReasoning(capabilities, 'off')).toBeUndefined();
  });
  it('uses medium instead of inventing low when only high/medium/none are supported', () => {
    const capabilities = parseOpenRouterReasoningCapabilities({
      mandatory: false,
      supported_efforts: ['high', 'medium', 'none'],
    });
    expect(resolveOpenRouterReasoning(capabilities, 'lowest')).toEqual({
      enabled: true,
      effort: 'medium',
    });
    expect(resolveOpenRouterReasoning(capabilities, 'off')).toEqual({ enabled: false });
  });
  it('disables optional reasoning without advertised efforts and leaves unknown models alone', () => {
    expect(
      resolveOpenRouterReasoning(
        parseOpenRouterReasoningCapabilities({ mandatory: false, supported_efforts: null }),
        'lowest',
      ),
    ).toEqual({ enabled: true, effort: 'minimal' });
    expect(resolveOpenRouterReasoning({ mandatory: false }, 'lowest')).toEqual({ enabled: false });
    expect(resolveOpenRouterReasoning({ mandatory: true }, 'lowest')).toEqual({ enabled: true });
    expect(
      resolveOpenRouterReasoning({ mandatory: false, supportedEfforts: ['none'] }, 'lowest'),
    ).toEqual({ enabled: false });
    expect(resolveOpenRouterReasoning({ mandatory: false }, 'off')).toEqual({ enabled: false });
    expect(resolveOpenRouterReasoning(undefined, 'lowest')).toBeUndefined();
    expect(parseOpenRouterReasoningCapabilities({ mandatory: 'false' })).toBeUndefined();
  });
  it('enables the lowest positive effort even when the gateway defaults to reasoning off', () => {
    const capabilities = parseOpenRouterReasoningCapabilities({
      mandatory: false,
      supported_efforts: ['high', 'none', 'minimal', 'low'],
      default_effort: 'none',
      default_enabled: false,
    });
    expect(resolveOpenRouterReasoning(capabilities, 'lowest')).toEqual({
      enabled: true,
      effort: 'minimal',
    });
  });
});
