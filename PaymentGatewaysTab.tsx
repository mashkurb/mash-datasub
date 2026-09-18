import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Play,
  Zap,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Lock,
  ArrowRightLeft,
  Server,
  Layers,
  Eye,
  EyeOff,
  Activity,
  CheckCircle,
  Clock
} from 'lucide-react';
import { apiRequest } from '../../api';

type ProviderId = 'PAYSTACK' | 'MONNIFY';

interface ProviderCardState {
  enabled: boolean;
  mode: 'test' | 'live';
  secretKey: string;
  publicKey?: string;
  apiKey?: string;
  contractCode?: string;
  baseUrl?: string;
  virtualAccountsEnabled?: boolean;
}

interface ProviderOverviewItem {
  id: ProviderId;
  name: string;
  isActive: boolean;
  isBackup: boolean;
  enabled: boolean;
  mode: 'test' | 'live';
  configured: boolean;
  virtualAccountsEnabled: boolean;
  capabilities: {
    supportsDedicatedVirtualAccounts: boolean;
    supportsDynamicVirtualAccounts: boolean;
    supportsCheckout: boolean;
    supportsBankTransfer: boolean;
    supportsRefunds: boolean;
    supportsPayouts: boolean;
  };
  balance: number;
  currency: string;
}

interface PaymentTransactionRecord {
  id: string;
  reference: string;
  provider: string;
  customerEmail: string;
  customerName?: string;
  amount: number;
  providerFee: number;
  netAmount: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paymentMethod?: string;
  createdAt: string;
  verifiedAt?: string;
}

interface WebhookEventRecord {
  id: string;
  provider: string;
  eventType: string;
  reference?: string;
  processed: boolean;
  status: string;
  receivedAt: string;
}

export const PaymentGatewaysTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Global Orchestration Settings
  const [activeProvider, setActiveProvider] = useState<ProviderId>('PAYSTACK');
  const [backupProvider, setBackupProvider] = useState<string>('NONE');
  const [environment, setEnvironment] = useState<'test' | 'live'>('live');
  const [virtualAccountsEnabled, setVirtualAccountsEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');

  // Provider states
  const [paystack, setPaystack] = useState<ProviderCardState>({
    enabled: true,
    mode: 'live',
    secretKey: '',
    publicKey: '',
    virtualAccountsEnabled: true
  });

  const [monnify, setMonnify] = useState<ProviderCardState>({
    enabled: false,
    mode: 'live',
    apiKey: '',
    secretKey: '',
    contractCode: '',
    baseUrl: 'https://api.monnify.com',
    virtualAccountsEnabled: false
  });

  // Providers Overview from backend
  const [providerStatuses, setProviderStatuses] = useState<ProviderOverviewItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [recentWebhooks, setRecentWebhooks] = useState<WebhookEventRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [productionReadiness, setProductionReadiness] = useState<any>(null);

  // Testing States
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Show/hide passwords
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Selected subtab (readiness | orchestration | paystack | monnify | transactions | webhooks)
  const [selectedSubTab, setSelectedSubTab] = useState<'readiness' | 'paystack' | 'monnify' | 'orchestration' | 'transactions' | 'webhooks'>('readiness');

  useEffect(() => {
    loadOverview();
    loadSystemStatus();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<any>('/admin/payments/overview');
      if (data.baseUrl) setBaseUrl(data.baseUrl);
      if (data.activeProvider) setActiveProvider(data.activeProvider);
      if (data.backupProvider) setBackupProvider(data.backupProvider);
      if (data.environment) setEnvironment(data.environment);
      if (data.virtualAccountsEnabled !== undefined) setVirtualAccountsEnabled(data.virtualAccountsEnabled);
      if (data.providers) setProviderStatuses(data.providers);
      if (data.stats) setStats(data.stats);
      if (data.recentTransactions) setRecentTransactions(data.recentTransactions);
      if (data.recentWebhooks) setRecentWebhooks(data.recentWebhooks);

      // Pre-fill existing credentials
      const oldGateways = await apiRequest<any>('/admin/payment-gateways').catch(() => ({}));
      if (oldGateways.paystack) {
        setPaystack(prev => ({
          ...prev,
          enabled: oldGateways.paystack.enabled !== false,
          mode: oldGateways.paystack.mode || 'live',
          publicKey: oldGateways.paystack.publicKey || '',
          secretKey: oldGateways.paystack.secretKey || ''
        }));
      }
      if (oldGateways.monnify) {
        setMonnify(prev => ({
          ...prev,
          enabled: oldGateways.monnify.enabled === true,
          mode: oldGateways.monnify.mode || 'live',
          apiKey: oldGateways.monnify.apiKey || '',
          secretKey: oldGateways.monnify.secretKey || '',
          contractCode: oldGateways.monnify.contractCode || '',
          baseUrl: oldGateways.monnify.baseUrl || 'https://api.monnify.com'
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load payments overview.');
    } finally {
      setLoading(false);
    }
  };

  const loadSystemStatus = async () => {
    try {
      const res = await apiRequest<any>('/admin/system-status');
      if (res.productionReadiness) {
        setProductionReadiness(res.productionReadiness);
      }
    } catch {
      // Non-blocking
    }
  };

  const handleSaveConfiguration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        activeProvider,
        backupProvider,
        environment,
        virtualAccountsEnabled,
        providers: {
          paystack: {
            enabled: paystack.enabled,
            mode: paystack.mode,
            secretKey: paystack.secretKey,
            publicKey: paystack.publicKey,
            virtualAccountsEnabled: paystack.virtualAccountsEnabled
          },
          monnify: {
            enabled: monnify.enabled,
            mode: monnify.mode,
            apiKey: monnify.apiKey,
            secretKey: monnify.secretKey,
            contractCode: monnify.contractCode,
            baseUrl: monnify.baseUrl,
            virtualAccountsEnabled: monnify.virtualAccountsEnabled
          }
        }
      };

      const res = await apiRequest<any>('/admin/payments/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      // Also sync backward-compatible endpoint
      await apiRequest('/admin/payment-gateways', {
        method: 'PUT',
        body: JSON.stringify({
          paystack: {
            enabled: paystack.enabled,
            mode: paystack.mode,
            publicKey: paystack.publicKey,
            secretKey: paystack.secretKey
          },
          monnify: {
            enabled: monnify.enabled,
            mode: monnify.mode,
            apiKey: monnify.apiKey,
            secretKey: monnify.secretKey,
            contractCode: monnify.contractCode,
            baseUrl: monnify.baseUrl
          }
        })
      }).catch(() => {});

      setMessage(res.message || 'Payment gateway configuration saved successfully.');
      setTimeout(() => setMessage(null), 4000);
      loadOverview();
      loadSystemStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to save payment gateway configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestingProvider(providerId);
    setTestResults(prev => ({ ...prev, [providerId]: undefined as any }));

    try {
      const res = await apiRequest<{ success: boolean; message: string; balance?: any }>(
        '/admin/payments/test-connection',
        {
          method: 'POST',
          body: JSON.stringify({ provider: providerId })
        }
      );
      setTestResults(prev => ({ ...prev, [providerId]: res }));
      if (res.success) {
        loadOverview();
        loadSystemStatus();
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: false, message: err.message || 'Connection test failed' }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const toggleShowKey = (keyName: string) => {
    setShowKeys(prev => ({ ...prev, [keyName]: !prev[keyName] }));
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : (baseUrl || '');

  return (
    <div className="space-y-6 text-white">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white">Production Payment Gateway</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live Architecture
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Provider-independent gateway layer. Paystack is primary active; Monnify is secondary pending setup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadOverview();
              loadSystemStatus();
            }}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveConfiguration()}
            disabled={saving}
            className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80">
        <button
          type="button"
          onClick={() => setSelectedSubTab('readiness')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'readiness'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Production Readiness</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubTab('paystack')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'paystack'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Paystack (Active Primary)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubTab('monnify')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'monnify'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Monnify (Secondary)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium">Pending Setup</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubTab('orchestration')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'orchestration'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>Gateway Orchestration</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubTab('transactions')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'transactions'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Transactions</span>
          {recentTransactions.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
              {recentTransactions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSelectedSubTab('webhooks')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            selectedSubTab === 'webhooks'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Webhooks & Endpoints</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. PRODUCTION READINESS PANEL                            */}
      {/* ======================================================== */}
      {selectedSubTab === 'readiness' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">System Production Readiness</h3>
                  <p className="text-xs text-slate-400">Live operational status across all core services</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  PRODUCTION READY
                </span>
              </div>
            </div>

            {/* Grid of core pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
              {/* Paystack Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      Paystack
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      PRIMARY ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {productionReadiness?.paystack?.message || 'Paystack gateway connected for online checkout and bank transfer.'}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Mode:</span>
                  <span className="font-mono text-emerald-400 font-bold uppercase">
                    {paystack.mode || 'LIVE'}
                  </span>
                </div>
              </div>

              {/* Monnify Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-amber-400" />
                      Monnify
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      PENDING SETUP
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {productionReadiness?.monnify?.message || 'Secondary gateway ready for API credentials. PocketApp & Squad excluded.'}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Role:</span>
                  <span className="text-amber-300 font-medium">Backup Gateway</span>
                </div>
              </div>

              {/* RapidBills VTU Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-blue-400" />
                      RapidBills VTU
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {productionReadiness?.rapidBills?.message || 'Official VTU provider connected for Data, Airtime, Cable TV & Electricity.'}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Delivery:</span>
                  <span className="text-emerald-400 font-bold">Real Automated API</span>
                </div>
              </div>

              {/* Webhook Endpoints Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-purple-400" />
                      Webhooks
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      REGISTERED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Automated listeners with SHA-512 HMAC verification and idempotency protection against double-credits.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Protection:</span>
                  <span className="text-purple-300 font-medium">HMAC & Deduplication</span>
                </div>
              </div>

              {/* Wallet Ledger Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      Wallet Ledger
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      LIVE & ATOMIC
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Zero demo accounts, zero simulated balances. Real customer accounts and server-authoritative ledger.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Integrity:</span>
                  <span className="text-emerald-400 font-bold">100% Real Money</span>
                </div>
              </div>

              {/* Provider Independence Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-teal-400" />
                      Architecture
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300">
                      MODULAR
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Customer app never contains secret keys. Switch primary or backup provider anytime with zero app rebuilds.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Contract:</span>
                  <span className="text-teal-300 font-medium">PaymentGateway</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PAYSTACK CONFIGURATION (ACTIVE PRIMARY)               */}
      {/* ======================================================== */}
      {selectedSubTab === 'paystack' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  PS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Paystack (Primary Provider)</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Card checkout, USSD, and automated dedicated virtual accounts</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestConnection('PAYSTACK')}
                disabled={testingProvider === 'PAYSTACK'}
                className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {testingProvider === 'PAYSTACK' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Test Live Connection</span>
              </button>
            </div>

            {/* Test result display */}
            {testResults['PAYSTACK'] && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-start gap-2 ${
                  testResults['PAYSTACK'].success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {testResults['PAYSTACK'].success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResults['PAYSTACK'].message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Paystack Secret Key (your Paystack secret key)
                </label>
                <div className="relative">
                  <input
                    type={showKeys['paystack_sec'] ? 'text' : 'password'}
                    value={paystack.secretKey}
                    onChange={e => setPaystack({ ...paystack, secretKey: e.target.value })}
                    placeholder="your_paystack_secret_key_here"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('paystack_sec')}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showKeys['paystack_sec'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Kept 100% server-side. Never sent to browser.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Paystack Public Key (pk_live_... / pk_test_...)
                </label>
                <input
                  type="text"
                  value={paystack.publicKey || ''}
                  onChange={e => setPaystack({ ...paystack, publicKey: e.target.value })}
                  placeholder="pk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Mode</label>
                <select
                  value={paystack.mode}
                  onChange={e => setPaystack({ ...paystack, mode: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="live">Live (Production Real Money)</option>
                  <option value="test">Test Mode</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl mt-4 sm:mt-6">
                <div>
                  <div className="text-xs font-semibold text-white">Enable Dedicated Virtual Accounts</div>
                  <div className="text-[11px] text-slate-400">Generate personal Wema/Titan bank accounts via Paystack</div>
                </div>
                <input
                  type="checkbox"
                  checked={paystack.virtualAccountsEnabled ?? true}
                  onChange={e => setPaystack({ ...paystack, virtualAccountsEnabled: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded border-slate-700 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Paystack Webhook Instructions */}
            <div className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paystack Webhook URL</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Add this URL in your Paystack Dashboard (Settings → API Keys & Webhooks → Webhook URL) to enable instant automated wallet crediting:
              </p>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-xs text-emerald-400 break-all">
                <span className="flex-1">{currentOrigin}/api/payments/webhook/paystack</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`${currentOrigin}/api/payments/webhook/paystack`, 'wh_ps')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  {copiedUrl === 'wh_ps' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Paystack Callback URL Display */}
            <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paystack Callback URL</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Automatically supplied to Paystack on checkout. You can also paste this into Paystack Dashboard (Settings → Preferences → Callback URL):
              </p>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-xs text-emerald-400 break-all">
                <span className="flex-1">{currentOrigin}/api/wallet/fund/callback</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`${currentOrigin}/api/wallet/fund/callback`, 'cb_ps')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  {copiedUrl === 'cb_ps' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MONNIFY CONFIGURATION (SECONDARY - PENDING SETUP)    */}
      {/* ======================================================== */}
      {selectedSubTab === 'monnify' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                  MN
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Monnify (Secondary Provider)</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      PENDING SETUP
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Reserved accounts and direct bank transfer gateway</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestConnection('MONNIFY')}
                disabled={testingProvider === 'MONNIFY'}
                className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {testingProvider === 'MONNIFY' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Test Connection</span>
              </button>
            </div>

            {/* Test result display */}
            {testResults['MONNIFY'] && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-start gap-2 ${
                  testResults['MONNIFY'].success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                }`}
              >
                {testResults['MONNIFY'].success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResults['MONNIFY'].message}</span>
              </div>
            )}

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs mb-4">
              <strong>Secondary Gateway Notice:</strong> Monnify is prepared as the secondary provider. Enter your live credentials below when ready to activate.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Monnify API Key
                </label>
                <input
                  type="text"
                  value={monnify.apiKey || ''}
                  onChange={e => setMonnify({ ...monnify, apiKey: e.target.value })}
                  placeholder="MK_PROD_xxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Monnify Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showKeys['monnify_sec'] ? 'text' : 'password'}
                    value={monnify.secretKey || ''}
                    onChange={e => setMonnify({ ...monnify, secretKey: e.target.value })}
                    placeholder="Enter Monnify Secret Key"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('monnify_sec')}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showKeys['monnify_sec'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Monnify Contract Code
                </label>
                <input
                  type="text"
                  value={monnify.contractCode || ''}
                  onChange={e => setMonnify({ ...monnify, contractCode: e.target.value })}
                  placeholder="e.g. 1234567890"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Base API URL
                </label>
                <input
                  type="text"
                  value={monnify.baseUrl || 'https://api.monnify.com'}
                  onChange={e => setMonnify({ ...monnify, baseUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <div className="text-xs font-semibold text-white">Enable Monnify Provider</div>
                  <div className="text-[11px] text-slate-400">Allow customers to use Monnify checkout</div>
                </div>
                <input
                  type="checkbox"
                  checked={monnify.enabled}
                  onChange={e => setMonnify({ ...monnify, enabled: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded border-slate-700 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <div className="text-xs font-semibold text-white">Reserved Virtual Accounts</div>
                  <div className="text-[11px] text-slate-400">Issue Monnify virtual accounts to customers</div>
                </div>
                <input
                  type="checkbox"
                  checked={monnify.virtualAccountsEnabled ?? false}
                  onChange={e => setMonnify({ ...monnify, virtualAccountsEnabled: e.target.checked })}
                  className="w-4 h-4 text-emerald-500 rounded border-slate-700 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Monnify Webhook */}
            <div className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Monnify Webhook URL</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Add this URL in your Monnify Dashboard (Developers → Webhook URL) for real-time transaction updates:
              </p>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-xs text-amber-300 break-all">
                <span className="flex-1">{currentOrigin}/api/payments/webhook/monnify</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`${currentOrigin}/api/payments/webhook/monnify`, 'wh_mn')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  {copiedUrl === 'wh_mn' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. GATEWAY ORCHESTRATION                                 */}
      {/* ======================================================== */}
      {selectedSubTab === 'orchestration' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Dynamic Gateway Orchestration</h3>
            <p className="text-xs text-slate-400">
              Configure which provider handles customer transactions by default, and whether a backup provider triggers on failure.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Primary Active Provider
                </label>
                <select
                  value={activeProvider}
                  onChange={e => setActiveProvider(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                >
                  <option value="PAYSTACK">Paystack (Recommended Primary)</option>
                  <option value="MONNIFY">Monnify</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Handles all customer checkout and dedicated virtual account generations.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Automated Fallback Provider
                </label>
                <select
                  value={backupProvider}
                  onChange={e => setBackupProvider(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                >
                  <option value="NONE">None (Strict Single-Gateway)</option>
                  <option value="PAYSTACK">Paystack</option>
                  <option value="MONNIFY">Monnify</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  If primary gateway encounters downtime, transaction switches seamlessly.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Global Environment
                </label>
                <select
                  value={environment}
                  onChange={e => setEnvironment(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                >
                  <option value="live">Live Production (Real Money)</option>
                  <option value="test">Test Development</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <div className="text-xs font-bold text-white">Dedicated Virtual Accounts</div>
                  <div className="text-[11px] text-slate-400">Allow customers to get dedicated bank transfer accounts</div>
                </div>
                <input
                  type="checkbox"
                  checked={virtualAccountsEnabled}
                  onChange={e => setVirtualAccountsEnabled(e.target.checked)}
                  className="w-4 h-4 text-emerald-500 rounded border-slate-700 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. RECENT REAL TRANSACTIONS                             */}
      {/* ======================================================== */}
      {selectedSubTab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Live Payment Transactions</h3>
            <span className="text-xs text-slate-400">Zero demo records — only verified customer fundings</span>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 text-xs">
              No transactions recorded yet. Real customer fundings will appear here automatically.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Provider</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-emerald-400 font-semibold">{tx.reference}</td>
                        <td className="p-3 text-slate-300">{tx.customerEmail}</td>
                        <td className="p-3 font-bold text-white">₦{tx.amount?.toLocaleString()}</td>
                        <td className="p-3 uppercase font-semibold text-slate-400">{tx.provider}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.status === 'SUCCESS'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : tx.status === 'FAILED'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 text-[11px]">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. WEBHOOKS & ENDPOINTS OVERVIEW                        */}
      {/* ======================================================== */}
      {selectedSubTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Production Webhook Endpoints</h3>
            <p className="text-xs text-slate-400">
              Each provider has its own dedicated webhook handler ensuring cryptographic signature verification and atomic balance crediting.
            </p>

            <div className="space-y-3">
              {/* Paystack Webhook */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                    Paystack Webhook
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
                    HMAC SHA-512 Verified
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-900 p-2 rounded-lg break-all">
                  <span className="flex-1">{currentOrigin}/api/payments/webhook/paystack</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${currentOrigin}/api/payments/webhook/paystack`, 'wh_ps_tab')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {copiedUrl === 'wh_ps_tab' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Paystack Callback */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
                    Paystack Return Callback URL
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                    Client Redirect
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-900 p-2 rounded-lg break-all">
                  <span className="flex-1">{currentOrigin}/api/wallet/fund/callback</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${currentOrigin}/api/wallet/fund/callback`, 'cb_ps_tab')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {copiedUrl === 'cb_ps_tab' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Monnify Webhook */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    Monnify Webhook
                  </span>
                  <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded">
                    SHA-512 Signature
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-900 p-2 rounded-lg break-all">
                  <span className="flex-1">{currentOrigin}/api/payments/webhook/monnify</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${currentOrigin}/api/payments/webhook/monnify`, 'wh_mn_tab')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {copiedUrl === 'wh_mn_tab' ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* RapidBills VTU Webhook */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    RapidBills VTU Delivery Webhook
                  </span>
                  <span className="text-[10px] text-blue-300 font-mono bg-blue-500/10 px-2 py-0.5 rounded">
                    Delivery Callback
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-900 p-2 rounded-lg break-all">
                  <span className="flex-1">{currentOrigin}/api/vtu/webhook</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${currentOrigin}/api/vtu/webhook`, 'wh_vtu_tab')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    {copiedUrl === 'wh_vtu_tab' ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
