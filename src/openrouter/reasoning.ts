// Uses gateway-declared reasoning capabilities, never guesses support from a model name.
export type OpenRouterReasoningEffort =
  | 'max'
  | 'xhigh'
  | 'high'
  | 'medium'
  | 'low'
  | 'minimal'
  | 'none';
export interface OpenRouterReasoningCapabilities {
  readonly mandatory: boolean;
  readonly supportedEfforts?: readonly OpenRouterReasoningEffort[];
  readonly defaultEffort?: string;
  readonly defaultEnabled?: boolean;
}
export interface OpenRouterReasoningConfiguration {
  readonly enabled?: boolean;
  readonly effort?: OpenRouterReasoningEffort;
}
const EFFORTS: readonly OpenRouterReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export const parseOpenRouterReasoningCapabilities = (
  value: unknown,
): OpenRouterReasoningCapabilities | undefined => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mandatory' in value) ||
    typeof value.mandatory !== 'boolean'
  )
    return undefined;
  const data = value as Record<string, unknown>;
  const supported =
    data.supported_efforts === null
      ? [...EFFORTS, 'none' as const]
      : Array.isArray(data.supported_efforts)
        ? [...EFFORTS, 'none' as const].filter((effort) =>
            (data.supported_efforts as unknown[]).includes(effort),
          )
        : undefined;
  return {
    mandatory: value.mandatory,
    ...(supported ? { supportedEfforts: supported } : {}),
    ...(typeof data.default_effort === 'string' ? { defaultEffort: data.default_effort } : {}),
    ...(typeof data.default_enabled === 'boolean' ? { defaultEnabled: data.default_enabled } : {}),
  };
};

export const resolveOpenRouterReasoning = (
  capabilities: OpenRouterReasoningCapabilities | undefined,
  mode: 'lowest' | 'off',
): OpenRouterReasoningConfiguration | undefined => {
  if (!capabilities) return undefined;
  if (mode === 'off') return capabilities.mandatory ? undefined : { enabled: false };
  const effort = EFFORTS.find((level) => capabilities.supportedEfforts?.includes(level));
  // Enabling a model without advertised efforts selects its provider default, not a minimum.
  // Keep fixed mandatory reasoning; disable optional reasoning when no active level is declared.
  return effort ? { enabled: true, effort } : { enabled: capabilities.mandatory };
};
