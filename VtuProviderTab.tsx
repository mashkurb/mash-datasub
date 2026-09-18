import React, { useState, useEffect } from 'react';
import { Cpu, CheckCircle2, AlertCircle, Loader2, Save, Play, RefreshCw, Layers } from 'lucide-react';
import { apiRequest } from '../../api';

export const VtuProviderTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [providerName, setProviderName] = useState('RAPIDBILLS');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('https://www.rapidbills.ng/api/reseller/v1');
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<'test' | 'live'>('live');

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; balance?: number } | null>(null);

  useEffect(() => {
    loadVtuConfig();
  }, []);

  const loadVtuConfig = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        apiKey: string;
        hasApiKey: boolean;
        apiUrl: string;
        providerName: string;
        enabled: boolean;
        mode: 'test' | 'live';
      }>('/admin/vtu-provider');

      setProviderName(data.providerName || 'RAPIDBILLS');
      setApiKey(data.apiKey || '');
      setApiUrl(data.apiUrl || 'https://www.rapidbills.ng/api/reseller/v1');
      setEnabled(data.enabled !== false);
      setMode(data.mode || 'live');
    } catch (err: any) {
      setError(err.message || 'Failed to load VTU provider configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res: any = await apiRequest('/admin/vtu-provider', {
        method: 'PUT',
        body: JSON.stringify({
          providerName,
          apiKey,
          apiUrl,
          enabled,
          mode
        })
      });

      setMessage(res.message || 'RapidBills VTU Engine configuration saved successfully.');
      setTimeout(() => setMessage(null), 4000);
      loadVtuConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to update VTU provider settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string; balance?: number }>('/admin/test/vtu', {
        method: 'POST',
        body: JSON.stringify({
          apiKey,
          apiUrl
        })
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'VTU Provider connection test failed.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    setError(null);
    setMessage(null);
    try {
      const res: any = await apiRequest('/admin/vtu/sync-catalog', {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      });

      if (res.success) {
        setMessage(`Success: Synchronized ${res.count} real live data plans from RapidBills official catalog.`);
        setTimeout(() => setMessage(null), 5000);
      } else {
        setError(res.error || res.message || 'Failed to synchronize catalog from RapidBills.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to RapidBills catalog endpoint.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Loading VTU Engine configuration...</span>
      </div>
    );
  }

  const isConfigured = Boolean(apiKey && apiKey.length > 0);

  return (
    <form onSubmit={handleSave} className="space-y-6 text-white">
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

      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">RapidBills VTU Engine</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  isConfigured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {isConfigured ? 'Configured' : 'Not Configured'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Automated Data, Airtime, Electricity &amp; TV Dispatch Provider</p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
            />
            <span className="font-bold">{enabled ? 'Active Engine' : 'Disabled'}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Provider Name
            </label>
            <input
              type="text"
              value={providerName}
              readOnly
              className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-300 font-semibold cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Execution Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold focus:border-emerald-500"
            >
              <option value="live">Live Production (Real Dispatch)</option>
              <option value="test">Test / Sandbox Mode</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              RapidBills Reseller API Base URL
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://www.rapidbills.ng/api/reseller/v1"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Official RapidBills Reseller API Endpoint: <span className="text-emerald-400 font-mono">https://www.rapidbills.ng/api/reseller/v1</span>
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              RapidBills API Bearer Secret Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter RapidBills live API key (e.g. rb_live_...)"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              All credentials remain strictly server-side. No provider user ID or manual product codes are required; provider IDs (MTN: 1, GLO: 2, AIRTEL: 3, 9MOBILE: 4) and live bundles are retrieved directly from the official RapidBills catalog.
            </p>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
              testResult.success
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.balance !== undefined && (
              <span className="font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg">
                API Balance: ₦{testResult.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={syncingCatalog || !isConfigured}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sky-400 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
          >
            {syncingCatalog ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing Official RapidBills Catalog...</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span>Sync Real Plans from RapidBills</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !isConfigured}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-400 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking RapidBills API Balance...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Test RapidBills Connection</span>
              </>
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-sm transition-all"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Saving VTU Engine Settings...</span>
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            <span>Save VTU Engine Settings</span>
          </>
        )}
      </button>
    </form>
  );
};
