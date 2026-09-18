import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CloudDownload,
  Check,
  X,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Sliders,
  DollarSign,
  ShieldCheck,
  Wifi
} from 'lucide-react';
import { apiRequest } from '../../api';
import { DataPlan } from '../../types';

interface PlansResponse {
  success: boolean;
  plans: DataPlan[];
  meta: {
    providerName: string;
    isConfigured: boolean;
    lastSyncAt: string | null;
    syncStatus: string;
    totalPlans: number;
    syncedPlans: number;
  };
}

export const DataPlansTab: React.FC = () => {
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [meta, setMeta] = useState<PlansResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [networkFilter, setNetworkFilter] = useState<'ALL' | 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'SME' | 'Corporate' | 'Gift'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDataPlans();
  }, []);

  const loadDataPlans = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<any>('/admin/plans');
      if (Array.isArray(data)) {
        setPlans(data);
      } else if (data && data.plans) {
        setPlans(data.plans);
        if (data.meta) {
          setMeta(data.meta);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load data plans.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPrices = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await apiRequest<any>('/admin/plans/sync-prices', {
        method: 'POST'
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Successfully synchronized ${res.count || 0} live plan prices from RapidBills!`
        });
        if (res.plans) {
          setPlans(res.plans);
        }
        await loadDataPlans();
      } else {
        setFeedback({
          type: 'error',
          message: res.message || res.error || 'Failed to synchronize prices from RapidBills.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error connecting to RapidBills VTU Provider. Please ensure your API key is configured in VTU Provider settings.'
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleStartEdit = (plan: DataPlan) => {
    setEditingPlanId(plan.id);
    setEditPrice(plan.sellingPrice.toString());
  };

  const handleCancelEdit = () => {
    setEditingPlanId(null);
    setEditPrice('');
  };

  const handleSavePrice = async (planId: string) => {
    const numPrice = Number(editPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid selling price in Naira.' });
      return;
    }

    setSavingPriceId(planId);
    setFeedback(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string; plan?: DataPlan; profit?: number | null }>(
        '/admin/plans/price',
        {
          method: 'POST',
          body: JSON.stringify({ planId, sellingPrice: numPrice })
        }
      );

      setFeedback({
        type: 'success',
        message: res.message || `Selling price updated to ₦${numPrice.toLocaleString()}!`
      });

      // Update local state immediately
      setPlans(prev =>
        prev.map(p => (p.id === planId ? { ...p, sellingPrice: numPrice } : p))
      );
      setEditingPlanId(null);

      // Auto-clear feedback after 4 seconds
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update selling price.' });
    } finally {
      setSavingPriceId(null);
    }
  };

  // Filter plans
  const filteredPlans = plans.filter(p => {
    if (networkFilter !== 'ALL' && p.network !== networkFilter) return false;
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchAmount = (p.dataAmount || '').toLowerCase().includes(q);
      const matchNet = (p.network || '').toLowerCase().includes(q);
      const matchId = (p.providerCode || p.rapidBillsId || p.id || '').toLowerCase().includes(q);
      if (!matchName && !matchAmount && !matchNet && !matchId) return false;
    }
    return true;
  });

  // Calculate high-level stats for summary cards
  const totalCount = plans.length;
  const syncedCount = plans.filter(p => p.apiPrice !== undefined && p.apiPrice !== null && p.apiPrice > 0).length;
  const avgProfit = (() => {
    const validWithProfit = plans.filter(p => p.apiPrice !== undefined && p.apiPrice !== null && p.apiPrice > 0);
    if (!validWithProfit.length) return null;
    const totalProf = validWithProfit.reduce((sum, p) => sum + (p.sellingPrice - (p.apiPrice || 0)), 0);
    return Math.round((totalProf / validWithProfit.length) * 10) / 10;
  })();

  const formatSyncTime = (isoString?: string | null) => {
    if (!isoString) return 'Not synced yet';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getNetworkBadge = (network: string) => {
    switch (network) {
      case 'MTN':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'AIRTEL':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'GLO':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case '9MOBILE':
        return 'bg-lime-500/10 text-lime-400 border border-lime-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'SME':
        return 'bg-sky-500/15 text-sky-300 border border-sky-500/30';
      case 'Corporate':
        return 'bg-purple-500/15 text-purple-300 border border-purple-500/30';
      case 'Gift':
        return 'bg-pink-500/15 text-pink-300 border border-pink-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">Data Plans & Provider Pricing</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              Provider: RapidBills
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            View real-time RapidBills wholesale API prices, independently configure customer retail selling prices, and monitor profit margins.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="admin-sync-provider-prices-btn"
            onClick={handleSyncPrices}
            disabled={syncing}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <CloudDownload className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            <span>{syncing ? 'Syncing RapidBills...' : 'Sync Provider Prices'}</span>
          </button>

          <button
            type="button"
            id="admin-refresh-plans-btn"
            onClick={loadDataPlans}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            title="Refresh Table"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Metadata & Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Connected Provider</div>
          <div className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
            <span>RapidBills VTU API</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Official Reseller Catalog</div>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sync Status</div>
          <div className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
            {syncedCount > 0 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Synced ({syncedCount} plans)</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">Not Synced</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Total in DB: {totalCount} plans
          </div>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Last Price Sync</div>
          <div className="text-sm font-bold text-white mt-1 truncate">
            {formatSyncTime(meta?.lastSyncAt || (plans.find(p => p.lastSyncAt)?.lastSyncAt))}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Server-side verified</div>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Average Profit Margin</div>
          <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{avgProfit !== null ? `+₦${avgProfit.toLocaleString()} / plan` : 'Awaiting sync'}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Admin-only visibility</div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex flex-col md:flex-row md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by size (1GB, 500MB), plan name, or RapidBills product ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Network Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] text-slate-500 font-semibold uppercase px-1">Network:</span>
          {(['ALL', 'MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map((net) => (
            <button
              key={net}
              type="button"
              onClick={() => setNetworkFilter(net)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                networkFilter === net
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {net}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] text-slate-500 font-semibold uppercase px-1">Category:</span>
          {(['ALL', 'SME', 'Corporate', 'Gift'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                categoryFilter === cat
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table: EXACT Columns in EXACT requested order:
          1. NETWORK
          2. PLAN / AMOUNT
          3. CATEGORY
          4. API PRICE (₦)
          5. SELLING PRICE (₦)
          6. ACTIONS
      */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-400 mb-2" />
          Loading data plans catalog...
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
          No data plans match your current search/filter criteria.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">1. NETWORK</th>
                  <th className="px-4 py-3.5">2. PLAN / AMOUNT</th>
                  <th className="px-4 py-3.5">3. CATEGORY</th>
                  <th className="px-4 py-3.5">4. API PRICE (₦)</th>
                  <th className="px-4 py-3.5">5. SELLING PRICE (₦)</th>
                  <th className="px-4 py-3.5 text-right">6. ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredPlans.map((plan) => {
                  const isEditing = editingPlanId === plan.id;
                  const isSaving = savingPriceId === plan.id;
                  const hasApiPrice = plan.apiPrice !== undefined && plan.apiPrice !== null && Number(plan.apiPrice) > 0;
                  const apiPriceNum = hasApiPrice ? Number(plan.apiPrice) : null;
                  const profit = apiPriceNum !== null ? plan.sellingPrice - apiPriceNum : null;

                  return (
                    <tr
                      key={plan.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isEditing ? 'bg-slate-800/60' : ''
                      }`}
                    >
                      {/* 1. NETWORK */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wide inline-block ${getNetworkBadge(
                            plan.network
                          )}`}
                        >
                          {plan.network}
                        </span>
                      </td>

                      {/* 2. PLAN / AMOUNT */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white text-sm">{plan.dataAmount}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <span>{plan.validity}</span>
                          <span className="text-slate-600">•</span>
                          <span className="font-mono text-[10px] text-slate-500" title="RapidBills Product Bundle ID">
                            ID: {plan.providerCode || plan.rapidBillsId || '—'}
                          </span>
                        </div>
                        {plan.isAvailable === false && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-1">
                            Unavailable from provider
                          </span>
                        )}
                      </td>

                      {/* 3. CATEGORY */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-block ${getCategoryBadge(
                            plan.category
                          )}`}
                        >
                          {plan.category}
                        </span>
                      </td>

                      {/* 4. API PRICE (₦) - Strictly READ-ONLY, fetched from RapidBills */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {hasApiPrice ? (
                          <div>
                            <div className="font-bold text-slate-200 text-sm flex items-center gap-1">
                              <span className="text-slate-400 text-xs">₦</span>
                              <span>{apiPriceNum?.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              RapidBills Cost (Read-only)
                            </span>
                          </div>
                        ) : plan.syncStatus === 'UNAVAILABLE' ? (
                          <div className="text-amber-400 font-semibold text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Unavailable</span>
                          </div>
                        ) : (
                          <div className="text-slate-500 italic text-xs">
                            Not synced
                          </div>
                        )}
                      </td>

                      {/* 5. SELLING PRICE (₦) - Admin's customer-facing price with profit margin */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400 font-bold">₦</span>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-28 px-2 py-1 bg-slate-950 border-2 border-emerald-500 rounded-lg text-white font-black text-sm focus:outline-none"
                                autoFocus
                                min="1"
                                placeholder="Selling Price"
                              />
                            </div>
                            {hasApiPrice && !isNaN(Number(editPrice)) && Number(editPrice) > 0 && (
                              <div className="text-[10px] text-slate-400">
                                Est. Profit:{' '}
                                <span
                                  className={`font-bold ${
                                    Number(editPrice) - apiPriceNum! >= 0
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {Number(editPrice) - apiPriceNum! >= 0 ? '+' : ''}₦
                                  {(Number(editPrice) - apiPriceNum!).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-black text-emerald-400 text-sm">
                              ₦{plan.sellingPrice.toLocaleString()}
                            </div>
                            {/* PROFIT = SELLING PRICE - API PRICE (Admin Only) */}
                            {profit !== null ? (
                              <div className="text-[11px] font-semibold mt-0.5">
                                {profit > 0 ? (
                                  <span className="text-emerald-400">Profit: +₦{profit.toLocaleString()}</span>
                                ) : profit === 0 ? (
                                  <span className="text-slate-400">Break-even (₦0)</span>
                                ) : (
                                  <span className="text-rose-400">Loss: -₦{Math.abs(profit).toLocaleString()}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Profit: Awaiting sync
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. ACTIONS */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSavePrice(plan.id)}
                              disabled={isSaving}
                              className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors shadow-sm"
                              title="Save Selling Price"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isSaving ? 'Saving...' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(plan)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl transition-all border border-slate-700/50 hover:border-emerald-500/30"
                          >
                            Edit Price
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Showing <strong className="text-white">{filteredPlans.length}</strong> of{' '}
              <strong className="text-white">{plans.length}</strong> plans
            </span>
            <span className="text-slate-500">
              API prices and profit calculations are secured on server and never disclosed to customers.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
