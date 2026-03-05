export interface AccountRecord {
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
}

export interface TransferRecord {
  readonly transferId: number;
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly number[];
  readonly buyplace: string | null;
}

export interface CreateTransferInput {
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly number[];
  readonly buyplace: string | null;
}

export interface CreateTransferResult {
  readonly transferId: number;
  readonly persistedAtIso: string;
}

export interface DbClient {
  initialize(bytes: Uint8Array): Promise<void>;
  close(): void;
  listAccounts(): readonly AccountRecord[];
  listTransfersForMonth(year: number, month: number): readonly TransferRecord[];
  createTransfer(input: CreateTransferInput): CreateTransferResult;
  exportBytes(): Uint8Array;
}
