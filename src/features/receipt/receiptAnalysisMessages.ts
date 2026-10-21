// Shares the exact production prompts/message construction with opt-in provider evaluation.
import type { OpenRouterChatMessage } from '@openrouter';
import type { ReceiptExtractionResult } from './receiptAnalysisContracts';
import {
  RECEIPT_EXTRACTION_IMAGE_INSTRUCTION,
  TRANSFER_DERIVATION_EXTRACTION_HEADING,
  TRANSFER_DERIVATION_CUSTOM_PROMPT_PLACEHOLDER,
} from './prompts';

export const receiptExtractionMessages = (
  systemPrompt: string,
  imageBase64: string,
): readonly OpenRouterChatMessage[] => [
  { role: 'system', content: systemPrompt },
  {
    role: 'user',
    content: [
      { type: 'text', text: RECEIPT_EXTRACTION_IMAGE_INSTRUCTION },
      { type: 'image/jpeg', base64: imageBase64 },
    ],
  },
];

export const receiptDerivationMessages = (
  systemPrompt: string,
  rules: string,
  extraction: ReceiptExtractionResult,
): readonly OpenRouterChatMessage[] => [
  {
    role: 'system',
    content: systemPrompt.replace(TRANSFER_DERIVATION_CUSTOM_PROMPT_PLACEHOLDER, () => rules),
  },
  {
    role: 'user',
    content: TRANSFER_DERIVATION_EXTRACTION_HEADING + '\n' + JSON.stringify(extraction),
  },
];
