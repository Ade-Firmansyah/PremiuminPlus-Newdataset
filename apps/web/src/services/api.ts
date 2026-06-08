const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_HEALTH_URL = API_BASE_URL.replace(/\/api\/?$/, '/health');
const maintenanceStorageKey = 'premiuminplus:maintenance-mode';
const maintenanceEventName = 'premiuminplus:maintenance-change';
let consecutiveApiFailures = 0;

type RequestOptions = RequestInit & {
  apiKey?: string;
  timeoutMs?: number;
  dedupe?: boolean;
  retry?: number;
  cacheTtlMs?: number;
  skipCache?: boolean;
};

export type AppRole = 'admin' | 'reseller';

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
  premku_id: number | string | null;
  provider_product_id?: number | string | null;
  name: string;
  code: string;
  note?: string;
  tag?: string;
  product_source?: 'provider' | 'manual' | 'hybrid';
  is_manual?: boolean;
  base_price: number;
  price_base?: number;
  admin_margin?: number;
  member_price: number;
  reseller_price: number;
  final_price: number;
  discount_label_percent?: number;
  image?: string;
  image_url?: string;
  tutorial_url?: string;
  manual_stock_count?: number;
  provider_stock_count?: number;
  stock: number;
  status: string;
  availability_status?: 'tersedia' | 'belum_tersedia';
}

export interface ProductStockItemRecord {
  id: number;
  product_id: number;
  email_account?: string | null;
  password_account?: string | null;
  password_masked?: string | null;
  description?: string | null;
  status: string;
  reserved_by_order_invoice?: string | null;
  used_by_order_invoice?: string | null;
  created_at?: string;
  reserved_at?: string | null;
  used_at?: string | null;
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
  locked_balance?: number;
  usable_balance?: number;
  total_transactions: number;
  total_transaksi?: number;
  total_spent: number;
  total_belanja?: number;
  total_deposits: number;
  total_deposit?: number;
  total_deposit_amount: number;
  saldo_masuk?: number;
  saldo_keluar?: number;
  bot_ledger?: {
    total_masuk: number;
    total_keluar: number;
    profit: number;
  };
  last_deposit?: DepositRecord | null;
  active_products: number;
  charts?: {
    deposits: number[];
    spending: number[];
    orders: number[];
    products: number[];
  };
  top_accounts?: TopAccountRecord[];
  chart?: Array<{ date: string; total: number }>;
  recent_transactions?: Array<{
    invoice: string;
    type: string;
    amount: number;
    status: string;
    description?: string;
    created_at?: string;
  }>;
  best_products?: Array<{
    product: string;
    sold: number;
    total: number;
  }>;
}

export interface DashboardRecord {
  saldo: number;
  total_deposit: number;
  total_order: number;
  total_transactions?: number;
  total_profit: number;
  bot_ledger?: {
    total_masuk: number;
    total_keluar: number;
    profit: number;
  };
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
  b2b_ledger?: {
    total_bot_orders: number;
    revenue_reseller: number;
    provider_cost: number;
    profit_admin: number;
    profit_reseller: number;
  };
  finance_activity?: {
    order_count: number;
    order_revenue: number;
    provider_cost: number;
    order_profit: number;
    deposit_count: number;
    deposit_amount: number;
    withdraw_count: number;
    withdraw_amount: number;
    wallet_in: number;
    wallet_out: number;
    net_wallet_movement: number;
    mutation_count: number;
    ledger_sync: {
      account_count: number;
      synced_count: number;
      mismatch_count: number;
      mismatch_amount: number;
    };
  };
  recent_finance_events?: Array<{
    event_id: string;
    event_type: string;
    reference?: string;
    title: string;
    amount: number;
    direction: 'in' | 'out' | 'neutral';
    status: string;
    user_id?: number;
    username?: string;
    created_at?: string;
  }>;
  operational?: {
    web_orders: number;
    bot_orders: number;
    manual_orders: number;
    successful_deposits: number;
    new_users_7d: number;
    balance_mutations_7d: number;
    pending_provider: number;
    manual_required: number;
  };
}

export interface BotSettingsRecord {
  id?: number;
  user_id?: number;
  brand_name?: string;
  greeting_hooks?: string;
  welcome_message?: string;
  admin_whatsapp?: string;
  operational_hours?: string;
  closing_message?: string;
  catalog_template?: 'template_1' | 'template_2' | 'template_3';
  order_template?: 'template_1' | 'template_2' | 'template_3';
  terms_text?: string;
  reseller_margin_type?: 'percent' | 'fixed';
  reseller_margin_value?: number;
  is_active?: boolean;
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
  db_status?: string;
}

export interface BotAnalyticsRecord {
  total_order_bot: number;
  total_pembayaran_masuk: number;
  total_modal_keluar: number;
  total_profit: number;
  total_transaksi_sukses: number;
  pending_payment: number;
}

export interface MaintenanceStatusRecord {
  enabled?: boolean;
  maintenance?: boolean;
  mode?: 'enabled' | 'disabled';
  message?: string;
  started_at?: string | null;
  started_by?: number | string | null;
}

export interface RestoreJobRecord {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'completed_with_warning' | 'failed';
  progress: number;
  message: string;
  logs: string[];
  files?: string[];
  preview: Array<{ table: string; rows: number }>;
  preview_counts?: Record<string, number>;
  metadata?: Record<string, unknown> | null;
  backup_info?: Record<string, unknown> | null;
  checksums?: Record<string, number> | null;
  result?: {
    warnings?: string[];
    checklist?: Record<string, boolean>;
    validation?: Record<string, { backup: number; database: number; ok: boolean }>;
  } | null;
}

export interface PublicStatsRecord {
  registered_users: number;
  displayed_users: number;
  user_base: number;
  user_growth_per_register: number;
  total_transactions: number;
  active_products: number;
  uptime_percent: number;
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
  reseller_markup?: number;
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
  user_id?: number;
  username?: string;
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
  retry_count?: number;
  fulfillment_type?: string | null;
  fulfilled_at?: string | null;
  manual_email?: string | null;
  manual_password?: string | null;
  manual_note?: string | null;
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
  provider_invoice?: string | null;
  amount: number;
  total_bayar?: number;
  payment_type?: string;
  qr_data?: string | null;
  qr_image?: string | null;
  qr_raw?: string | null;
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
  provider_invoice?: string | null;
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
  created_at?: string | null;
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
  invoice?: string;
  username?: string;
  email?: string;
  amount: number;
  status: string;
  bank_account?: string;
  bank_name?: string;
  method?: string;
  account_number?: string;
  account_name?: string;
  admin_note?: string;
  notes?: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  processed_at?: string | null;
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

export interface BalanceMutationRecord {
  id: number;
  user_id: number;
  username: string;
  email?: string;
  mutation_type: string;
  direction: 'in' | 'out' | 'neutral';
  saldo_masuk: number;
  nominal: number;
  saldo_keluar: number;
  balance_before: number;
  balance_after: number;
  source_type?: string;
  source_ref?: string;
  admin_executor_id?: number | null;
  admin_executor?: string;
  notes?: string;
  created_at?: string;
}

export interface BalanceMutationSummary {
  total_in: number;
  total_out: number;
  net_movement: number;
  incoming_count: number;
  outgoing_count: number;
  neutral_count: number;
}

export interface PaginatedResponse<T> {
  status: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  summary?: BalanceMutationSummary;
}

const inflightRequests = new Map<string, Promise<unknown>>();
const recentFailures = new Map<string, { until: number; error: Error }>();
const responseCache = new Map<string, { until: number; value: unknown }>();

function defaultCacheTtl(path: string, method: string) {
  if (method !== 'GET') return 0;
  if (path.startsWith('/products')) return 5 * 60 * 1000;
  if (path.startsWith('/me') || path.startsWith('/bot-settings') || path.startsWith('/community/settings')) return 60 * 1000;
  if (path.startsWith('/notifications')) return 30 * 1000;
  if (path.startsWith('/dashboard/summary') || path.startsWith('/admin/summary')) return 30 * 1000;
  if (path.includes('/status') || path.startsWith('/order/')) return 0;
  if (path.startsWith('/admin/finance/balance-mutations')) return 5 * 1000;
  if (path.startsWith('/admin/')) return 10 * 1000;
  return 15 * 1000;
}

export function clearApiCache(prefix = '') {
  for (const key of responseCache.keys()) {
    if (!prefix || key.includes(prefix)) responseCache.delete(key);
  }
}

export function setMaintenanceMode(enabled: boolean) {
  if (enabled) localStorage.setItem(maintenanceStorageKey, '1');
  else localStorage.removeItem(maintenanceStorageKey);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(maintenanceEventName, { detail: { enabled } }));
  }
}

export function isMaintenanceMode() {
  return localStorage.getItem(maintenanceStorageKey) === '1';
}

function recordApiSuccess() {
  consecutiveApiFailures = 0;
}

function recordApiFailure(error: Error) {
  if (!/backend belum aktif|jaringan|fetch|network|timeout|empty body|html returned|json parse/i.test(error.message)) {
    return;
  }
  consecutiveApiFailures += 1;
  if (consecutiveApiFailures >= 3) {
    setMaintenanceMode(true);
  }
}

export async function checkBackendHealth(timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_HEALTH_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

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
  const cacheTtlMs = options.cacheTtlMs ?? defaultCacheTtl(path, method);
  const cachedFailure = recentFailures.get(key);

  if (method !== 'GET' && isMaintenanceMode() && !path.startsWith('/admin/') && path !== '/login') {
    throw new Error('Server sedang maintenance. Transaksi sementara dinonaktifkan.');
  }

  if (cachedFailure && cachedFailure.until > Date.now()) {
    throw cachedFailure.error;
  }

  if (shouldDedupe && inflightRequests.has(key)) {
    return inflightRequests.get(key) as Promise<T>;
  }

  const cachedResponse = responseCache.get(key);
  if (!options.skipCache && cacheTtlMs > 0 && cachedResponse && cachedResponse.until > Date.now()) {
    return cachedResponse.value as T;
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
          if (parsed.maintenance === true) setMaintenanceMode(true);
          const message = typeof parsed.message === 'string' ? parsed.message : 'Request gagal';
          const apiError = new Error(message) as Error & { code?: string; data?: unknown };
          if (typeof parsed.code === 'string') apiError.code = parsed.code;
          if (parsed.data !== undefined) apiError.data = parsed.data;
          throw apiError;
        }

        if (method !== 'GET') {
          clearApiCache();
        }
        if (cacheTtlMs > 0) {
          responseCache.set(key, { until: Date.now() + cacheTtlMs, value: parsed });
        }
        recordApiSuccess();
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
    recordApiFailure(error);
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
  systemStatus: () =>
    apiRequest<{ status: boolean; success?: boolean; data: { maintenance: boolean; message?: string; started_at?: string | null } }>('/system/status', {
      cacheTtlMs: 5000,
    }),
  login: (payload: { username: string; password: string }) =>
    apiRequest<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  register: (payload: { username: string; password: string; confirm_password?: string; email?: string; phone?: string }) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>('/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  forgotPassword: (payload: { identifier: string }) =>
    apiRequest<{ status: boolean; success?: boolean; message: string }>('/forgot-password', {
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
  regenerateMyApiKey: (apiKey?: string) =>
    apiRequest<{ status: boolean; data: { api_key: string } }>('/me/apikey/regenerate', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({}),
    }),
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
  withdraws: (apiKey?: string) => apiRequest<{ status: boolean; data: WithdrawRecord[] }>('/withdraws', { apiKey }),
  withdraw: (payload: { amount: number; bank_account: string; account_number: string; account_name: string; notes?: string }, apiKey?: string) =>
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
  adminPendingOrders: (apiKey?: string) => apiRequest<{ status: boolean; data: OrderRecord[] }>('/admin/pending-orders', { apiKey }),
  adminSendManualOrder: (invoice: string, payload: { email: string; password: string; note?: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: OrderRecord }>(`/admin/orders/${invoice}/manual-fulfill`, { apiKey, method: 'POST', body: JSON.stringify(payload) }),
  adminCompleteOrder: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: OrderRecord }>(`/admin/orders/${invoice}/manual-complete`, { apiKey, method: 'POST' }),
  adminCancelRefundOrder: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: OrderRecord }>(`/admin/orders/${invoice}/cancel`, { apiKey, method: 'POST' }),
  adminRetryOrder: (invoice: string, apiKey?: string) =>
    apiRequest<{ status: boolean; data: OrderRecord }>(`/admin/orders/${invoice}/retry`, { apiKey, method: 'POST' }),
  adminDeposits: (apiKey?: string) => apiRequest<{ status: boolean; data: DepositRecord[] }>('/admin/deposits', { apiKey }),
  adminWithdraws: (apiKey?: string) => apiRequest<{ status: boolean; data: WithdrawRecord[] }>('/admin/withdraws', { apiKey }),
  adminBalanceMutations: (params: Record<string, string | number | undefined>, apiKey?: string) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    const query = search.toString();
    return apiRequest<PaginatedResponse<BalanceMutationRecord>>(`/admin/finance/balance-mutations${query ? `?${query}` : ''}`, { apiKey });
  },
  adminBalanceMutationsCsv: async (params: Record<string, string | number | undefined>, apiKey?: string) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    const key =
      apiKey ||
      localStorage.getItem('premiuminplus:api-key') ||
      sessionStorage.getItem('premiuminplus:api-key') ||
      '';
    const response = await fetch(`${API_BASE_URL}/admin/finance/balance-mutations.csv?${search.toString()}`, {
      headers: key ? { 'x-api-key': key } : undefined,
    });
    if (!response.ok) throw new Error('Gagal export mutasi saldo');
    return response.blob();
  },
  adminDownloadBackup: async (apiKey?: string) => {
    const key =
      apiKey ||
      localStorage.getItem('premiuminplus:api-key') ||
      sessionStorage.getItem('premiuminplus:api-key') ||
      '';
    const response = await fetch(`${API_BASE_URL}/admin/system/backup`, {
      headers: key ? { 'x-api-key': key } : undefined,
    });
    if (!response.ok) throw new Error('Gagal download backup');
    return response.blob();
  },
  adminMaintenance: (apiKey?: string) =>
    apiRequest<{ status: boolean; success?: boolean; data: MaintenanceStatusRecord }>('/admin/maintenance', {
      apiKey,
      skipCache: true,
    }),
  updateAdminMaintenance: (payload: { enabled: boolean; message: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; success?: boolean; message: string; data: MaintenanceStatusRecord }>('/admin/maintenance', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminRestoreBackup: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; mode: string; data: Array<{ table: string; rows: number }>; message: string }>('/admin/system/restore', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUploadRestoreZip: (payload: { file_name: string; file_base64: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; success?: boolean; mode: string; message: string; data: RestoreJobRecord }>('/admin/system/restore/upload', {
      method: 'POST',
      apiKey,
      timeoutMs: 30000,
      body: JSON.stringify(payload),
    }),
  adminRestoreJobStatus: (jobId: string, apiKey?: string) =>
    apiRequest<{ status: boolean; success?: boolean; data: RestoreJobRecord }>(`/admin/system/restore/${jobId}/status`, {
      apiKey,
      skipCache: true,
      cacheTtlMs: 0,
    }),
  adminConfirmRestoreJob: (jobId: string, apiKey?: string) =>
    apiRequest<{ status: boolean; success?: boolean; message: string; data: RestoreJobRecord }>(`/admin/system/restore/${jobId}/confirm`, {
      method: 'POST',
      apiKey,
      timeoutMs: 30000,
      body: JSON.stringify({ confirm: true }),
    }),
  adminApproveWithdraw: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: WithdrawRecord }>(`/admin/withdraws/${id}/approve`, {
      method: 'PATCH',
      apiKey,
    }),
  adminRejectWithdraw: (id: number, notes: string, apiKey?: string, options?: { reason_code?: string; notify_user?: boolean; notification_message?: string }) =>
    apiRequest<{ status: boolean; data: WithdrawRecord }>(`/admin/withdraws/${id}/reject`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify({ notes, ...(options || {}) }),
    }),
  adminCreateUser: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>('/admin/create-user', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUpdateUser: (id: number, payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: AdminUserRecord }>(`/admin/users/${id}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminRegenerateUserApiKey: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: { id: number; username: string; api_key: string } }>(`/admin/users/${id}/regenerate-api-key`, {
      method: 'POST',
      apiKey,
      body: JSON.stringify({}),
    }),
  publicConfig: () => apiRequest<{ status: boolean; data: { admin_whatsapp: string; support_whatsapp?: string; stats?: PublicStatsRecord } }>('/config/public'),
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
  adminProducts: (apiKey?: string) => apiRequest<{ status: boolean; source: string; data: ProductRecord[] }>('/admin/products', { apiKey }),
  adminCreateManualProduct: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>('/admin/products/manual', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminCreateHybridProduct: (payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>('/admin/products/hybrid', {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminSyncProviderProducts: (apiKey?: string) =>
    apiRequest<{ status: boolean; source: string; data: ProductRecord[] }>('/admin/products/sync-provider', {
      method: 'POST',
      apiKey,
    }),
  adminUpdateProduct: (id: number, payload: Record<string, unknown>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/products/${id}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminProductStockItems: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductStockItemRecord[] }>(`/admin/products/${id}/stock-items`, { apiKey }),
  adminAddProductStockItem: (id: number, payload: { email_account: string; password_account: string; description?: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/products/${id}/stock-items`, {
      method: 'POST',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminUpdateProductStockItem: (_id: number, itemId: number, payload: { email_account: string; password_account?: string; description?: string; status?: string }, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/product-stock-items/${itemId}`, {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  adminDisableProductStockItem: (_id: number, itemId: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/product-stock-items/${itemId}/disable`, {
      method: 'PATCH',
      apiKey,
    }),
  adminDeleteProductStockItem: (_id: number, itemId: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/product-stock-items/${itemId}`, {
      method: 'DELETE',
      apiKey,
    }),
  adminDeleteProduct: (id: number, apiKey?: string) =>
    apiRequest<{ status: boolean; data: ProductRecord }>(`/admin/products/${id}`, {
      method: 'DELETE',
      apiKey,
    }),
  markup: (apiKey?: string) => apiRequest<{ status: boolean; data: MarkupSettingRecord }>('/admin/markup', { apiKey }),
  updateMarkup: (payload: MarkupSettingRecord, apiKey?: string) =>
    apiRequest<{ status: boolean; data: MarkupSettingRecord; updated_products?: number; pricing_sync?: unknown }>('/admin/markup', {
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
  resellerBotSettings: (apiKey?: string) => apiRequest<{ status: boolean; data: BotSettingsRecord }>('/bot/settings', { apiKey }),
  updateResellerBotSettings: (payload: Partial<BotSettingsRecord>, apiKey?: string) =>
    apiRequest<{ status: boolean; data: BotSettingsRecord }>('/bot/settings', {
      method: 'PATCH',
      apiKey,
      body: JSON.stringify(payload),
    }),
  botHistory: (apiKey?: string) => apiRequest<{ status: boolean; data: DirectPaymentRecord[] }>('/bot/history', { apiKey }),
  botAnalytics: (apiKey?: string) => apiRequest<{ status: boolean; data: BotAnalyticsRecord }>('/bot/analytics', { apiKey }),
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
