// Checks only locally knowable prerequisites; never parses user-owned grouping prompt text.
import type { AddTransferOptionsState } from '../transfers/transferOptions';
import { DEFAULT_RECEIPT_CATEGORY_NAMES } from './prompts/transferDerivationPrompt';
import {
  validateReceiptSourceAccountTopology,
  type ReceiptTransferPreparationError,
} from './receiptTransferCommandBuilder';

export const validateReceiptSetup = (
  options: AddTransferOptionsState,
  usesDefaultRules: boolean,
): ReceiptTransferPreparationError | null => {
  const topologyError = validateReceiptSourceAccountTopology(options);
  if (topologyError !== null) return topologyError;
  if (!usesDefaultRules) return null;

  for (const name of DEFAULT_RECEIPT_CATEGORY_NAMES) {
    const matches = options.categoryOptions.filter((category) => category.name === name);
    if (matches.length !== 1) {
      return {
        code: matches.length === 0 ? 'category_not_found' : 'category_ambiguous',
        detail: name,
      };
    }
  }
  return null;
};
