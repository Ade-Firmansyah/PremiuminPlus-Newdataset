const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.premiuminplus.store/api';

type RequestOptions = RequestInit & {
  apiKey?: string;
  timeoutMs?: number;
  dedupe?: boolean;
  retry?: number;
};

export type AppRole = 'admin' | 'reseller' | 'member';

export interface LoginResponse {
  status: boolean;
  role: AppRole;
  api_key: string;
  user: {
    username: string;
    saldo: number;
    status: string;
  };
}

export interface ProductRecord {
  id: number;
  premku_id: number | null;
  name: string;
  code: string;
  note?: string;
  tag?: string;
  price_base: number;
  price_sell: number;
  admin_margin?: number;
  reseller_markup?: number;
  reseller_markup_percent?: number;
  markup?: number;
  markup_percent?: number;
  discount_percent?: number;
  image?: string;
  stock: number;
  status: string;
  availability_status?: 'tersedia' | 'belum_tersedia';
}

export interface MeRecord {
  id: number;
  username: string;
  email: string;
  phone?: string;
  saldo: number;
  locked_balance?: number;
  usable_balance?: number;
  bot_access_unlocked?: boolean;
  bot_disabled_reason?: string;
  reseller_request_status?: string;
  role: AppRole;
  api_key: string;
  markup_percent?: number;
  reseller_margin_percent?: number;
  theme?: 'dark' | 'light';
}

export interface DashboardSummaryRecord {
  saldo: number;
  total_transactions: number;
  total_spent: number;
  total_deposits: number;
  total_deposit_amount: number;
  saldo_masuk?: number;
  saldo_keluar?: number;
  last_deposit?: DepositRecord | null;
  active_products: number;
  charts?: {
    deposits: number[];
    spending: number[];
    orders: number[];
    products: number[];
  };
  top_accounts?: TopAccountRecord[];
}

export interface DashboardRecord {
  saldo: number;
  total_deposit: number;
  total_order: number;
  total_transactions?: number;
  total_profit: number;
  recent_transactions: Array<{
    invoice: string;
    amount: number;
    status: string;
    type: string;
    date: string;
  }>;
  chart_data: Array<{
    date: string;
    deposits: number;
    purchases: number;
    profit: number;
  }>;
  products: Array<{
    product: string;
    price: number;
    stock: number;
    sold: number;
  }>;
}

export interface TopAccountRecord {
  rank: number;
  id: number;
  username: string;
  role: AppRole;
  saldo: number;
}

export interface AdminSummaryRecord {
  total_users: number;
  active_resellers: number;
  total_reseller_balance: number;
  total_transactions: number;
  total_revenue: number;
  system_profit: number;
  pending_withdraw_count: number;
  pending_withdraw: number;
  recent_orders?: OrderRecord[];
  pending_payments?: DirectPaymentRecord[];
  recent_users?: AdminUserRecord[];
}

export interface BotSettingsRecord {
  enabled: boolean;
  auto_reply_enabled: boolean;
  panel_name?: string;
  greeting_message: string;
  footer_message?: string;
  keyword_response?: string;
  auto_reply_prompt: string;
  order_format: string;
  features: {
    order_status: boolean;
    balance_check: boolean;
    product_catalog: boolean;
  };
}

export interface BotSessionRecord {
  session_id: string;
  status: string;
  connected: boolean;
  qr?: string | null;
  connected_number?: string | null;
  last_active?: string | null;
  reconnect_attempt?: number;
}

export interface AdminUserRecord {
  id: number;
  username: string;
  role: AppRole;
  fullName?: string;
  email?: string;
  phone?: string;
  saldo: number;
  status: string;
  orders?: number;
  deposits?: number;
  lastLogin?: string;
  notes?: string;
  api_key?: string;
  markup_percent?: number;
  reseller_margin_percent?: number;
}

export interface MarkupRangeRecord {
  min: number;
  max: number | null;
  percent: number;
}

export interface MarkupSettingRecord {
  markup: number;
  markup_type: 'fixed' | 'percent';
  member_markup?: number;
  reseller_markup?: number;
  member_markup_ranges?: MarkupRangeRecord[];
  reseller_markup_ranges?: MarkupRangeRecord[];
}

export interface DiscountSettingRecord {
  discount_percent: number;
}

export interface NotificationRecord {
  id: number;
  title: string;
  message: string;
  type?: string;
  is_active?: boolean;
  is_pinned?: boolean;
  target_role: 'all' | AppRole;
  created_by?: number | null;
  created_at?: string;
}

export interface CommunitySettingsRecord {
  group_link: string;
  pinned_message: string;
  announcement: string;
  support_text: string;
}

export interface OrderRecord {
  id?: number;
  invoice: string;
  product_id?: number;
  product_name?: string;
  product_image?: string | null;
  description?: string;
  qty?: number;
  total_price?: number;
  price_base?: number;
  price_sell?: number;
  profit?: number;
  reseller_profit?: number;
  transaction_type?: string;
  status?: string;
  payment_status?: string;
  provider_invoice?: string | null;
  provider_status?: string | null;
  order_status?: string;
  channel?: string;
  account_data?: {
    email?: string;
    password?: string;
    description?: string;
    [key: string]: unknown;
  } | null;
  accounts?: Array<{
    username?: string;
    password?: string;
    [key: string]: unknown;
  }>;
  target_whatsapp?: string | null;
  delivery_status?: string | null;
  delivery_time?: string | null;
  processing_started_at?: string | null;
  success_at?: string | null;
  created_at?: string;
}

export interface DepositRecord {
  id?: number;
  user_id?: number;
  invoice: string;
  amount: number;
  total_bayar?: number;
  payment_type?: string;
  qr_data?: string | null;
  qr_image?: string | null;
  status?: string;
  expired_at?: string | null;
  canceled_at?: string | null;
  processed_at?: string | null;
  created_at?: string;
}

export interface DirectPaymentRecord {
  id?: number;
  user_id?: number;
  invoice: string;
  amount: number;
  total_bayar?: number;
  payment_type?: string;
  status?: string;
  qr_image?: string | null;
  qr_raw?: string | null;
  product_id?: number | null;
  qty?: number;
  target_whatsapp?: string | null;
  order_invoice?: string | null;
  processed_at?: string | null;
  expired_at?: string | null;
  canceled_at?: string | null;
  order?: {
    invoice: string;
    product_name?: string;
    email_account?: string | null;
    password_account?: string | null;
    payment_status?: string;
    provider_status?: string;
    order_status?: string;
    target_whatsapp?: string | null;
    delivery_status?: string | null;
    delivery_time?: string | null;
    total_price?: number;
    processing_started_at?: string | null;
    success_at?: string | null;
    created_at?: string;
  } | null;
  created_at?: string;
}

export interface PremkuProfileRecord {
  available: boolean;
  saldo?: number | null;
  username?: string;
  whatsapp?: string;
  message?: string;
}

export interface WithdrawRecord {
  id: number;
  user_id: number;
  username?: string;
  email?: string;
  amount: number;
  status: string;
  bank_account?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string | null;
}

export interface SaldoLogRecord {
  id: number;
  user_id: number;
  type: 'credit' | 'debit' | 'refund' | 'adjustment';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference?: string;
  notes?: string;
  created_at?: string;
}

const inflightRequests = new Map<string, Promise<unknown>>();
const recentFailures = new Map<string, { until: number; error: Error }>();

function requestKey(path: string, options: RequestOptions, apiKey: string) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = typeof options.body === 'string' ? options.body : '';
  return `${method}:${path}:${apiKey}:${body}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function normalizeNetworkError(error: unknown) {
  if (isAbortError(error)) return new Error('Request dibatalkan.');
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return new Error('Backend belum aktif atau jaringan sedang tidak stabil.');
  }
  return error instanceof Error ? error : new Error('Request gagal.');
}

function createTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  const abort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    },
  };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiKey =
    options.apiKey ||
    localStorage.getItem('premiuminplus:api-key') ||
    sessionStorage.getItem('premiuminplus:api-key') ||
    '';
  const key = requestKey(path, options, apiKey);
  const method = String(options.method || 'GET').toUpperCase();
  const shouldDedupe = options.dedupe ?? method === 'GET';
  const cachedFailure = recentFailures.get(key);

  if (cachedFailure && cachedFailure.until > Date.now()) {
    throw cachedFailure.error;
  }

  if (shouldDedupe && inflightRequests.has(key)) {
    return inflightRequests.get(key) as Promise<T>;
  }

  const executeRequest = async () => {
    const retryLimit = Math.max(0, Number(options.retry ?? (method === 'GET' ? 1 : 0)));
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? 12000, options.signal);

      try {
        const headers = new Headers(options.headers);
        headers.set('content-type', 'application/json');
        if (apiKey) headers.set('x-api-key', apiKey);

        const response = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers,
          signal,
        });

        const raw = await response.text();
        const trimmed = raw.trim();

        if (!trimmed) {
          throw new Error('Invalid API response (empty body)');
        }

        if (trimmed.startsWith('<')) {
          console.error('[FRONTEND]', { event: 'invalid-html-response', path });
          throw new Error('Invalid API response (HTML returned)');
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch (parseError) {
          console.error('[FRONTEND]', { event: 'invalid-json-response', path, parseError });
          throw new Error('Invalid API response (JSON parse failed)');
        }

        if (!response.ok) {
          const message = typeof parsed.message === 'string' ? parsed.message : 'Request gagal';
          throw new Error(message);
        }

        return parsed as T;
      } catch (caught) {
        lastError = normalizeNetworkError(caught);
        const retryable = method === 'GET' && !isAbortError(caught) && attempt < retryLimit;
        if (!retryable) break;
        await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
      } finally {
        cleanup();
      }
    }

    const error = lastError || new Error('Request gagal.');
    if (method === 'GET' && /backend belum aktif|jaringan|fetch|network|timeout/i.test(error.message)) {
      recentFailures.set(key, { until: Date.now() + 2500, error });
    }
    throw error;
  };

  const promise = executeRequest().finally(() => {
    inflightRequests.delete(key);
  });

  if (shouldDedupe) inflightRequests.set(key, promise);
  return promise;
}

export const premiuminApi = {
  login: (payload: { username: string; password: string }) =>
    apiRequest<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  register: (payload: { username: string; password: string; email?: string; phone?: string }) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>('/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  forgotPassword: (payload: { username: string; email: string; phone: string }) =>
    apiRequest<{ status: boolean; password: string; message: string }>('/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  products: (apiKey?: string) => apiRequest<{ status: boolean; data: ProductRecord[] }>('/products', { apiKey }),
  me: (apiKey?: string) => apiRequest<{ status: boolean; data: MeRecord }>('/me', { apiKey }),
  updateMyPreferences: (payload: { theme?: 'dark' | 'light'; markup_percent?: number; reseller_margin_percent?: number }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>('/me/preferences', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  dashboardSummary: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: DashboardSummaryRecord }>('/dashboard/summary', { apiKey }),
  dashboard: (apiKey?: string) => apiRequest<{ status: boolean; data: DashboardRecord }>('/dashboard', { apiKey }),
  myApiKey: (apiKey?: string) => apiRequest<{ status: boolean; data: { api_key: string } }>('/me/apikey', { apiKey }),
  topAccounts: (apiKey?: string) => apiRequest<{ status: boolean; data: TopAccountRecord[] }>('/leaderboard/accounts', { apiKey }),
  saldo: (apiKey?: string) => apiRequest<{ status: boolean; saldo: number }>('/saldo', { apiKey }),
  transactions: (apiKey?: string) => apiRequest<{ status: boolean; data: OrderRecord[] }>('/orders', { apiKey }),
  deposits: (apiKey?: string) => apiRequest<{ status: boolean; data: DepositRecord[] }>('/deposits', { apiKey }),
  saldoLogs: (apiKey?: string) => apiRequest<{ status: boolean; data: SaldoLogRecord[] }>('/saldo/logs', { apiKey }),
  notifications: (apiKey?: string) => apiRequest<{ status: boolean; data: NotificationRecord[] }>('/notifications', { apiKey }),
  communitySettings: (apiKey?: string) => apiRequest<{ status: boolean; data: CommunitySettingsRecord }>('/community/settings', { apiKey }),
  deposit: (payload: { amount: number }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DepositRecord }>('/deposit', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  botActivationDeposit: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: DepositRecord }>('/bot/activation/deposit', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({}),
    }),
  depositStatus: (invoice: string, apiKey?: string) => apiRequest<{ status: boolean; data: DepositRecord }>(`/deposit/${invoice}`, { apiKey }),
  depositCancel: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DepositRecord }>('/deposit/cancel', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({ invoice }),
    }),
  withdraw: (payload: { amount: number; bank_account: string; account_number: string; notes?: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: WithdrawRecord }>('/withdraw', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  order: (payload: { product_id: number; qty?: number }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: OrderRecord }>('/order', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  orderStatus: (invoice: string, apiKey?: string) => apiRequest<{ status: boolean; data: OrderRecord }>(`/order/${invoice}`, { apiKey }),
  directOrderPayment: (payload: { product_id: number; qty?: number }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DirectPaymentRecord }>('/payments/direct-order', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  directPaymentStatus: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DirectPaymentRecord }>(`/payments/${invoice}/status`, { apiKey }),
  directPaymentCancel: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DirectPaymentRecord }>('/payments/cancel', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({ invoice }),
    }),
  adminUsers: (apiKey?: string) => apiRequest<{ status: boolean; data: AdminUserRecord[] }>('/admin/users', { apiKey }),
  adminSummary: (apiKey?: string) => apiRequest<{ status: boolean; data: AdminSummaryRecord }>('/admin/summary', { apiKey }),
  adminPremkuProfile: (apiKey?: string) => apiRequest<{ status: boolean; data: PremkuProfileRecord }>('/admin/premku-profile', { apiKey }),
  adminTransactions: (apiKey?: string) => apiRequest<{ status: boolean; data: OrderRecord[] }>('/admin/transactions', { apiKey }),
  adminDeposits: (apiKey?: string) => apiRequest<{ status: boolean; data: DepositRecord[] }>('/admin/deposits', { apiKey }),
  adminWithdraws: (apiKey?: string) => apiRequest<{ status: boolean; data: WithdrawRecord[] }>('/admin/withdraws', { apiKey }),
  adminApproveWithdraw: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: WithdrawRecord }>(`/admin/withdraws/${id}/approve`, {
      method: 'PATCH',
      apiKey,
    }),
  adminRejectWithdraw: (id: number, notes: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: WithdrawRecord }>(`/admin/withdraws/${id}/reject`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify({ notes }),
    }),
  adminCreateUser: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>('/admin/create-user', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUpdateUser: (id: number, payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>(`/admin/update-user/${id}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  publicConfig: () => apiRequest<{ status: boolean; data: { admin_whatsapp: string } }>('/config/public'),
  adminDeleteUser: (id: number, username_confirmation: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>(`/admin/delete-user/${id}`, {
      method: 'DELETE',
      apiKey,
      body: JSON.stringify({ username_confirmation }),
    }),
  adminCreateProduct: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>('/admin/products', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUpdateProduct: (id: number, payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/products/${id}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminDeleteProduct: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/products/${id}`, {
      method: 'DELETE',
      apiKey,
    }),
  markup: (apiKey?: string) => apiRequest<{ status: boolean; data: MarkupSettingRecord }>('/admin/markup', { apiKey }),
  updateMarkup: (payload: MarkupSettingRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: MarkupSettingRecord }>('/admin/markup', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  discount: (apiKey?: string) => apiRequest<{ status: boolean; data: DiscountSettingRecord }>('/admin/discount', { apiKey }),
  updateDiscount: (payload: DiscountSettingRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: DiscountSettingRecord }>('/admin/discount', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminNotifications: (apiKey?: string) => apiRequest<{ status: boolean; data: NotificationRecord[] }>('/admin/notifications', { apiKey }),
  adminCommunitySettings: (apiKey?: string) => apiRequest<{ status: boolean; data: CommunitySettingsRecord }>('/admin/community-settings', { apiKey }),
  updateAdminCommunitySettings: (payload: CommunitySettingsRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: CommunitySettingsRecord }>('/admin/community-settings', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminCreateNotification: (payload: { title: string; message: string; target_role: 'all' | AppRole; type?: string; is_active?: boolean; is_pinned?: boolean }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: NotificationRecord }>('/admin/notifications', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUpdateNotification: (id: number, payload: Partial<NotificationRecord>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: NotificationRecord }>(`/admin/notifications/${id}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminDeleteNotification: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: NotificationRecord }>(`/admin/notifications/${id}`, {
      method: 'DELETE',
      apiKey,
    }),
  premkuKey: (apiKey?: string) => apiRequest<{ status: boolean; data: { configured: boolean; masked: string } }>('/admin/premku-key', { apiKey }),
  updatePremkuKey: (premkuApiKey: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: { configured: boolean; masked: string } }>('/admin/premku-key', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify({ api_key: premkuApiKey }),
    }),
  botSettings: (apiKey?: string) => apiRequest<{ status: boolean; data: BotSettingsRecord }>('/admin/bot-settings', { apiKey }),
  updateBotSettings: (payload: BotSettingsRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSettingsRecord }>('/admin/bot-settings', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  myBotSettings: (apiKey?: string) => apiRequest<{ status: boolean; data: BotSettingsRecord }>('/bot-settings', { apiKey }),
  updateMyBotSettings: (payload: BotSettingsRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSettingsRecord }>('/bot-settings', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  botSessionConnect: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSessionRecord }>('/bot/session/connect', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({}),
    }),
  botSessionStatus: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSessionRecord }>('/bot/session/status', { apiKey }),
  botSessionLogout: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSessionRecord }>('/bot/session/logout', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({}),
    }),
};
