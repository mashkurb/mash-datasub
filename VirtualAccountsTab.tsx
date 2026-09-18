import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Power,
  Loader2,
  ShieldCheck,
  CreditCard,
  RefreshCw,
  HelpCircle,
  Zap,
  ExternalLink
} from 'lucide-react';
import { apiRequest } from '../../api';

interface VirtualAccount {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  customerCode?: string;
  paystackCustomerId?: string;
  flwRef?: string;
  provider: 'PAYSTACK' | 'FLUTTERWAVE' | 'MONNIFY';
  status: 'ACTIVE' | 'PENDING' | 'FAILED' | 'NOT_ELIGIBLE' | 'DISABLED';
  failureReason?: string;
  totalReceived: number;
  lastFundedAt?: string;
  createdAt: string;
}

interface GatewayDvaStatus {
  available: boolean;
  message: string;
  accountCount: number;
}

interface DvaResponse {
  success: boolean;
  accounts: VirtualAccount[];
  metrics: {
    total: number;
    active: number;
    pending: number;
    totalVolume: number;
    paystackTotal?: number;
    paystackActive?: number;
    flutterwaveTotal?: number;
    flutterwaveActive?: number;
  };
  paystackStatus: GatewayDvaStatus;
  flutterwaveStatus?: GatewayDvaStatus;
}

export const VirtualAccountsTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshingPaystack, setRefreshingPaystack] = useState(false);
  const [refreshingFlutterwave, setRefreshingFlutterwave] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [metrics, setMetrics] = useState<any>({ total: 0, active: 0, pending: 0, totalVolume: 0 });
  const [paystackStatus, setPaystackStatus] = useState<GatewayDvaStatus | null>(null);
  const [flutterwaveStatus, setFlutterwaveStatus] = useState<GatewayDvaStatus | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<DvaResponse>('/admin/virtual-accounts');
      setAccounts(data.accounts || []);
      setMetrics(data.metrics || { total: 0, active: 0, pending: 0, totalVolume: 0 });
      setPaystackStatus(data.paystackStatus);
      if (data.flutterwaveStatus) {
        setFlutterwaveStatus(data.flutterwaveStatus);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch virtual accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPaystackStatus = async () => {
    setRefreshingPaystack(true);
    setMessage(null);
    setError(null);
    try {
      const status = await apiRequest<GatewayDvaStatus>('/admin/virtual-accounts/paystack-status');
      setPaystackStatus(status);
      if (status.available) {
        setMessage('Paystack Dedicated Virtual Accounts are ACTIVE for this business.');
      } else {
        setMessage(`Paystack Status: ${status.message}`);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to check status with Paystack.');
    } finally {
      setRefreshingPaystack(false);
    }
  };

  const handleCheckFlutterwaveStatus = async () => {
    setRefreshingFlutterwave(true);
    setMessage(null);
    setError(null);
    try {
      const status = await apiRequest<GatewayDvaStatus>('/admin/virtual-accounts/flutterwave-status');
      setFlutterwaveStatus(status);
      if (status.available) {
        setMessage('Flutterwave Virtual Accounts are ACTIVE.');
      } else {
        setMessage(`Flutterwave Status: ${status.message}`);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to check status with Flutterwave.');
    } finally {
      setRefreshingFlutterwave(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string; results?: any }>('/admin/virtual-accounts/sync-all', {
        method: 'POST'
      });
      setMessage(res.message);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to sync with providers.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryCustomer = async (userId: string, provider: 'PAYSTACK' | 'FLUTTERWAVE' = 'PAYSTACK') => {
    setRetryingId(`${userId}-${provider}`);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; dva: VirtualAccount; message: string }>(
        `/admin/virtual-accounts/retry/${userId}`,
        {
          method: 'POST',
          body: JSON.stringify({ provider })
        }
      );
      setMessage(res.message);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to retry provisioning.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    setMessage(null);
    setError(null);
    try {
      const enable = currentStatus === 'DISABLED';
      await apiRequest('/admin/virtual-accounts/toggle-status', {
        method: 'POST',
        body: JSON.stringify({ id, enabled: enable })
      });
      setMessage(`Account ${enable ? 'activated' : 'disabled'} successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const q = search.toLowerCase().trim();
    const matchQuery =
      (acc.userName || '').toLowerCase().includes(q) ||
      (acc.userEmail || '').toLowerCase().includes(q) ||
      (acc.userPhone || '').includes(q) ||
      (acc.accountNumber && acc.accountNumber.includes(q)) ||
      (acc.customerCode && acc.customerCode.toLowerCase().includes(q)) ||
      (acc.flwRef && acc.flwRef.toLowerCase().includes(q)) ||
      (acc.provider && acc.provider.toLowerCase().includes(q));

    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && acc.status === 'ACTIVE') ||
      (statusFilter === 'PENDING' && (acc.status === 'PENDING' || acc.status === 'NOT_ELIGIBLE')) ||
      (statusFilter === 'DISABLED' && acc.status === 'DISABLED');

    const matchProvider =
      providerFilter === 'ALL' ||
      (acc.provider || 'PAYSTACK') === providerFilter;

    return matchQuery && matchStatus && matchProvider;
  });

  return (
    <div className="space-y-5 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <span>Dedicated Virtual Accounts (DVA)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated customer wallet funding with Paystack &amp; Flutterwave Dedicated Accounts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCheckPaystackStatus}
            disabled={refreshingPaystack}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingPaystack ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
            <span>Check Paystack</span>
          </button>

          <button
            type="button"
            onClick={handleCheckFlutterwaveStatus}
            disabled={refreshingFlutterwave}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${refreshingFlutterwave ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
            <span>Check Flutterwave</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncing}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-500/20 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            <span>Sync All Customers</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Provider Status Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Paystack DVA Status */}
        {paystackStatus && (
          <div
            className={`p-4 rounded-2xl border ${
              paystackStatus.available
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <CreditCard className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 font-bold">
                  <span>Paystack Dedicated NUBAN:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                      paystackStatus.available
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {paystackStatus.available ? 'ACTIVE' : 'CAC REQUIRED'}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{paystackStatus.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Flutterwave DVA Status */}
        {flutterwaveStatus && (
          <div
            className={`p-4 rounded-2xl border ${
              flutterwaveStatus.available
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 font-bold">
                  <span>Flutterwave Virtual Accounts:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                      flutterwaveStatus.available
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {flutterwaveStatus.available ? 'ACTIVE' : 'KEYS REQUIRED'}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{flutterwaveStatus.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Customer DVAs</div>
          <div className="text-2xl font-black text-white mt-1">{metrics.total}</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider">Active Accounts</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.active}</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-amber-400 font-bold uppercase tracking-wider">Pending Accounts</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{metrics.pending}</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Inflow Credited</div>
          <div className="text-xl font-black text-white mt-1">₦{metrics.totalVolume.toLocaleString()}</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, account #..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Provider Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
            {['ALL', 'PAYSTACK', 'FLUTTERWAVE'].map((prov) => (
              <button
                key={prov}
                type="button"
                onClick={() => setProviderFilter(prov)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  providerFilter === prov
                    ? prov === 'FLUTTERWAVE'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {prov}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
            {['ALL', 'ACTIVE', 'PENDING', 'DISABLED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Provider</th>
                <th className="p-3.5">Bank &amp; Account #</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Inflow (₦)</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                    <span>Loading dedicated accounts from database...</span>
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No dedicated virtual accounts found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isRetrying = retryingId === `${acc.userId}-${acc.provider || 'PAYSTACK'}`;
                  return (
                    <tr key={acc.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-white">{acc.userName}</div>
                        <div className="text-[11px] text-slate-400">{acc.userPhone || acc.userEmail}</div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            acc.provider === 'FLUTTERWAVE'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {acc.provider || 'PAYSTACK'}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="text-slate-300 font-medium">{acc.bankName || 'Wema Bank'}</div>
                        {acc.accountNumber ? (
                          <span className="font-mono font-bold text-emerald-400 tracking-wider">
                            {acc.accountNumber}
                          </span>
                        ) : (
                          <div className="text-slate-500 text-[11px] italic">
                            {acc.failureReason ? (
                              <span title={acc.failureReason} className="cursor-help text-amber-400/80 underline decoration-dotted">
                                {acc.provider === 'FLUTTERWAVE' ? 'BVN/NIN or Verification Req' : 'Awaiting Paystack CAC'}
                              </span>
                            ) : (
                              'Not Assigned'
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            acc.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : acc.status === 'NOT_ELIGIBLE' || acc.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {acc.status}
                        </span>
                      </td>

                      <td className="p-3.5 text-right font-bold text-white">
                        ₦{(acc.totalReceived || 0).toLocaleString()}
                      </td>

                      <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleRetryCustomer(acc.userId, acc.provider || 'PAYSTACK')}
                          disabled={isRetrying}
                          title={`Retry ${acc.provider || 'PAYSTACK'} provisioning`}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          {isRetrying ? (
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          <span>Retry</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(acc.id, acc.status)}
                          title={acc.status === 'ACTIVE' ? 'Disable account' : 'Activate account'}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                            acc.status === 'ACTIVE'
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{acc.status === 'ACTIVE' ? 'Disable' : 'Enable'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
