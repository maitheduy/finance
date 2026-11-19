export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number; // in thousands VND (e.g. 50 = 50.000 VNĐ)
  category: string;
  description: string;
  date: string; // YYYY-MM-DD
  memberName: string; // e.g., 'Bố', 'Mẹ', 'Con', 'Chung'
  wallet: string; // e.g., 'Tiền mặt', 'VCB', 'Techcombank', 'Ví Momo'
  createdAt: string;
}

export interface RecurringBill {
  id: string;
  userId: string;
  title: string;
  amount: number; // in thousands VND
  category: string;
  frequency: 'monthly' | 'weekly' | 'yearly';
  dueDate: number; // day of month (1-31)
  status: 'pending' | 'paid';
  lastPaidDate?: string;
}

export interface Budget {
  id: string;
  userId: string;
  category: string;
  monthlyLimit: number; // in thousands VND
  month: string; // YYYY-MM
}

export interface AISettings {
  enabled: boolean;
  provider: 'gemini' | 'openai' | 'deepseek' | 'grok';
  apiKey: string;
}

export interface UserSettings {
  familyMembers: string[];
  wallets: string[];
  categories: {
    expense: string[];
    income: string[];
  };
  aiSettings: AISettings;
}
