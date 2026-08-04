// Shared contract for versioned, app-owned receipt prompts and defaults.
export interface VersionedReceiptPrompt {
  readonly version: number;
  readonly text: string;
}
