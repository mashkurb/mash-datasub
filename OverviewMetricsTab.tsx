import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  CreditCard,
  Building2,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Zap,
  Loader2
} from 'lucide-react';
import { apiRequest } from '../../api';
import { AdminOverviewMetrics } from '../../types';

interface OverviewMetricsTabProps {
  onNavigateTab?: (tab: string) => void;
}

export const OverviewMetricsTab: React.FC<OverviewMetricsTabProps> = ({ onNavigateTab }) => {
  const [metrics, setMetrics] = useState<AdminOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; metrics: AdminOverviewMetrics }>('/admin/overview-metrics');
      setMetrics(res.metrics);
    } catch (err: any) {
      setError(err.message || 'Failed to load live metrics.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        <span>Aggregating real-time production analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      {/* Top Banner with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black">Live Operational Command Center</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time transaction volume, wallet reserves, customer growth, and pending workflows.
          </p>
        </div>

        <button
          type="button"
          onClick={loadMetrics}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {metrics && (
        <>
          {/* Primary 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Sales Volume */}
            <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Total Sales Volume</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white">
                ₦{metrics.totalSales.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Successful VTU purchases</span>
              </div>
            </div>

            {/* Total Wallet Deposits / Funding */}
            <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Total Wallet Funding</span>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-emerald-400">
                ₦{metrics.totalFunding.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Paystack, Squad &amp; DVA</span>
              </div>
            </div>

            {/* Outstanding Customer Balances */}
            <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Total Customer Balances</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-400">
                ₦{metrics.totalWalletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Across {metrics.totalCustomers} registered accounts</span>
              </div>
            </div>

            {/* Today's Transactions & Volume */}
            <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Today's Activity</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-purple-300">
                ₦{metrics.todayVolume.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>{metrics.todayTransactionsCount} transactions processed today</span>
              </div>
            </div>
          </div>

          {/* Operational Secondary Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Transaction Health */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Transaction Health Breakdown</span>
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Total Transactions</span>
                  <span className="font-mono font-bold text-white">{metrics.totalTransactions}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-emerald-400 font-medium">Successful</span>
                  <span className="font-mono font-bold text-emerald-400">{metrics.successfulTransactionsCount}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-amber-400 font-medium">Pending Verification</span>
                  <span className="font-mono font-bold text-amber-400">{metrics.pendingTransactionsCount}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-red-400 font-medium">Failed</span>
                  <span className="font-mono font-bold text-red-400">{metrics.failedTransactionsCount}</span>
                </div>
              </div>
            </div>

            {/* Airtime to Cash Operations Status */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  <span>Airtime-to-Cash Payouts</span>
                </h3>
                {metrics.airtimeCashPending > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-bounce">
                    {metrics.airtimeCashPending} ACTION NEEDED
                  </span>
                )}
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-amber-400 font-medium">Pending Requests</span>
                  <span className="font-mono font-bold text-amber-400">{metrics.airtimeCashPending}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Completed Conversions</span>
                  <span className="font-mono font-bold text-emerald-400">{metrics.airtimeCashCompleted}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Total Cash Disbursed</span>
                  <span className="font-mono font-bold text-white">
                    ₦{metrics.airtimeCashTotalPayout.toLocaleString()}
                  </span>
                </div>
              </div>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('airtime-cash')}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Review Pending Conversions</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Services & Gateway Infrastructure */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Services &amp; Infrastructure</span>
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Active Customer Services</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {metrics.activeServicesCount} / {metrics.totalServicesCount}
                  </span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Active Customers</span>
                  <span className="font-mono font-bold text-white">{metrics.activeCustomers}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Primary Payment Gateway</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Paystack
                  </span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-950/60 rounded-xl">
                  <span className="text-slate-400">Secondary Gateway</span>
                  <span className="font-bold text-blue-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    Squad (HabariPay)
                  </span>
                </div>
              </div>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('dynamic-services')}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Manage Dynamic Services</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
