// Owns the versioned internal extraction prompt and editable default transfer-derivation prompt.
export interface VersionedReceiptPrompt {
  readonly version: number;
  readonly text: string;
}

export const RECEIPT_EXTRACTION_SYSTEM_PROMPT: VersionedReceiptPrompt = Object.freeze({
  version: 1,
  text: `Read the receipt image carefully. Extract the store, receipt date, EUR total, and every priced article with its exact integer-cent amount. Do not infer missing prices, omit priced lines, combine articles, or round amounts. If the receipt cannot be read completely and unambiguously, return a concise reason instead of partial data.`,
});

export const DEFAULT_TRANSFER_DERIVATION_PROMPT: VersionedReceiptPrompt = Object.freeze({
  version: 1,
  text: `Create one or more Conspectus transfers from the extracted receipt data.

Required rules:
- Assign every extracted article to exactly one transfer group.
- Preserve every article's exact integer-cent amount.
- The transfer amounts must sum exactly to the extracted receipt total.
- Use the receipt store as the buyplace and a concise group description as the transfer name.
- Return category names exactly as written in the editable mappings below. Use at most three categories per transfer.

GROUP AND CATEGORY MAPPINGS (adapt these names to your Conspectus categories):
- Food and drinks -> group: Groceries; categories: [Groceries]
- Household and cleaning products -> group: Household; categories: [Household]
- Personal care and drugstore products -> group: Personal care; categories: [Personal care]
- Articles that match none of the rules -> group: Other; categories: []

Do not invent articles, prices, discounts, fees, category names, or totals.`,
});
