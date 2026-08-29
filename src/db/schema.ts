import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EncryptedRecord } from '@/types';

interface FinancialFingerDB extends DBSchema {
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
    indexes: { by_member: string };
  };
  expense_categories: {
    key: string;
    value: EncryptedRecord;
  };
  expenses: {
    key: string;
    value: EncryptedRecord;
    indexes: { by_category: string; by_date: number };
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
}

export type AppDB = IDBPDatabase<FinancialFingerDB>;

let db: AppDB | null = null;

export async function getDB(): Promise<AppDB> {
  if (db) return db;

  db = await openDB<FinancialFingerDB>('financial-finger', 7, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('members');
        database.createObjectStore('settings');
        database.createObjectStore('expense_categories');
        database.createObjectStore('credit_cards');

        const incomeStore = database.createObjectStore('income_sources');
        incomeStore.createIndex('by_member', 'by_member');

        const expenseStore = database.createObjectStore('expenses');
        expenseStore.createIndex('by_category', 'by_category');
        expenseStore.createIndex('by_date', 'by_date');
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
    },
  });

  return db;
}
