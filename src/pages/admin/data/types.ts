export type AdminUserRole = 'Member' | 'Reseller' | 'Admin';

export type AdminUserStatus = 'Aktif' | 'Nonaktif' | 'Suspended';

export interface AdminUser {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: AdminUserRole;
  balance: number;
  status: AdminUserStatus;
  phone: string;
  email: string;
  orders: number;
  deposits: number;
  lastLogin: string;
  notes: string;
}

export type AdminTransactionStatus = 'Success' | 'Pending' | 'Failed' | 'Processing';

export interface AdminTopUpTransaction {
  id: string;
  invoice: string;
  username: string;
  method: string;
  amount: number;
  status: AdminTransactionStatus;
  createdAt: string;
  source: string;
}

export interface AdminOrderTransaction {
  id: string;
  invoice: string;
  username: string;
  product: string;
  amount: number;
  status: AdminTransactionStatus;
  createdAt: string;
  channel: string;
}

export interface MarkupTier {
  id: string;
  label: string;
  min: number;
  max: number | null;
  percent: number;
}
