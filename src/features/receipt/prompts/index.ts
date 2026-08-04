// Exposes app-owned receipt prompts and the user-editable derivation-rule default.
export {
  RECEIPT_EXTRACTION_IMAGE_INSTRUCTION,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
} from './extractionPrompt';
export {
  DEFAULT_TRANSFER_DERIVATION_RULES,
  TRANSFER_DERIVATION_EXTRACTION_HEADING,
  TRANSFER_DERIVATION_RULES_HEADING,
  TRANSFER_DERIVATION_SYSTEM_PROMPT,
} from './transferDerivationPrompt';
export type { VersionedReceiptPrompt } from './types';
