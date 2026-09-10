import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EncryptedRecord, RawSnapshot } from '@/types';

interface FinancialFingerDB extends DBSchema {
  bank_transactions: {
    key: string;
    value: EncryptedRecord;
  };
  import_records: {
    key: string;
    value: EncryptedRecord;
  };
  notifications: {
    key: string;
    value: EncryptedRecord;
  };
  members: {
    key: string;
    value: EncryptedRecord;
  };
  income_sources: {
    key: string;
    value: EncryptedRecord;
  };
  expense_categories: {
    key: string;
    value: EncryptedRecord;
  };
  expenses: {
    key: string;
    value: EncryptedRecord;
  };
  credit_cards: {
    key: string;
    value: EncryptedRecord;
  };
  debt_payments: {
    key: string;
    value: EncryptedRecord;
  };
  card_charges: {
    key: string;
    value: EncryptedRecord;
  };
  scenarios: {
    key: string;
    value: EncryptedRecord;
  };
  settings: {
    key: string;
    value: EncryptedRecord;
  };
  expense_paid_records: {
    key: string;
    value: EncryptedRecord;
  };
  bank_accounts: {
    key: string;
    value: EncryptedRecord;
  };
  calendar_marks: {
    key: string; // 'YYYY-MM-DD'
    value: EncryptedRecord;
  };
  calendar_memos: {
    key: string; // UUID
    value: EncryptedRecord;
  };
  account_transfers: {
    key: string;
    value: EncryptedRecord;
  };
  snapshots: {
    key: string;
    value: RawSnapshot;
  };
  transaction_rules: {
    key: string;
    value: EncryptedRecord;
  };
}

export type AppDB = IDBPDatabase<FinancialFingerDB>;

let db: AppDB | null = null;

export async function getDB(): Promise<AppDB> {
  if (db) return db;

  db = await openDB<FinancialFingerDB>('financial-finger', 14, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore('members');
        database.createObjectStore('settings');
        database.createObjectStore('expense_categories');
        database.createObjectStore('credit_cards');

        database.createObjectStore('income_sources');
        database.createObjectStore('expenses');
      }
      if (oldVersion < 2) {
        database.createObjectStore('scenarios');
      }
      if (oldVersion < 3) {
        database.createObjectStore('debt_payments');
      }
      if (oldVersion < 4) {
        database.createObjectStore('card_charges');
      }
      if (oldVersion < 5) {
        database.createObjectStore('expense_paid_records');
      }
      if (oldVersion < 6) {
        database.createObjectStore('bank_accounts');
      }
      if (oldVersion < 7) {
        database.createObjectStore('notifications');
      }
      if (oldVersion < 8) {
        database.createObjectStore('calendar_marks');
      }
      if (oldVersion < 9) {
        database.createObjectStore('calendar_memos');
      }
      if (oldVersion < 10) {
        database.createObjectStore('account_transfers');
      }
      if (oldVersion < 11) {
        database.createObjectStore('snapshots');
      }
      if (oldVersion < 12) {
        database.createObjectStore('bank_transactions');
        database.createObjectStore('import_records');
      }
      if (oldVersion < 13) {
        database.createObjectStore('transaction_rules');
      }
      if (oldVersion < 14) {
        // Remove indexes created at v1 that targeted fields on EncryptedRecord.
        // Those stores hold {iv, data} — the indexed field paths never existed,
        // so the indexes have been empty and unused since encryption was introduced.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const incomeStore = transaction.objectStore('income_sources') as any;
        if (incomeStore.indexNames.contains('by_member')) incomeStore.deleteIndex('by_member');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expenseStore = transaction.objectStore('expenses') as any;
        if (expenseStore.indexNames.contains('by_category')) expenseStore.deleteIndex('by_category');
        if (expenseStore.indexNames.contains('by_date')) expenseStore.deleteIndex('by_date');
      }
    },
  });

  return db;
}
