export type { IAccountingService } from './types';
export type {
  RecordChargeParams,
  UpdateChargeParams,
  RecordDebtPaymentParams,
  UpdateDebtPaymentParams,
  RecordBankDebitParams,
  RecordBankCreditParams,
  RecordTransferParams,
  ReconcileAccountParams,
  LedgerQueryParams,
  ResetAccountParams,
  RecordExpensePaymentParams,
  UpdateExpensePaymentParams,
} from './types';

import { AccountingService } from './service';
export { deriveBalance } from './service';

export const accounting: InstanceType<typeof AccountingService> = new AccountingService();
