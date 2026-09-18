import React, { useState, useEffect } from 'react';
import { Zap, Tv, Award, Repeat, CheckCircle2, AlertCircle, Loader2, Save, Check, X } from 'lucide-react';
import { apiRequest } from '../../api';

interface ElectricityProvider {
  id: string;
  name: string;
  enabled: boolean;
  fee: number;
}

interface TvProvider {
  id: string;
  name: string;
  enabled: boolean;
  fee: number;
  packages: { id: string; name: string; price: number }[];
}

interface ExamPinProduct {
  id: string;
  name: string;
  enabled: boolean;
  sellingPrice: number;
}

interface AirtimeCashRequest {
  id: string;
  reference: string;
  userId: string;
  userEmail: string;
  amount: number;
  status: string;
  metadata: {
    network: string;
    senderPhone: string;
    amountToTransfer: number;
    cashPayout: number;
    ratePercent: number;
    adminPhone: string;
    rejectionReason?: string;
  };
  createdAt: string;
}

export const ServicesConfigTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'electricity' | 'tv' | 'exam' | 'airtimeCash'>('electricity');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Services data
  const [electricity, setElectricity] = useState<ElectricityProvider[]>([]);
  const [tv, setTv] = useState<TvProvider[]>([]);
  const [examPins, setExamPins] = useState<ExamPinProduct[]>([]);
  const [airtimeCashRequests, setAirtimeCashRequests] = useState<AirtimeCashRequest[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadAllServices();
  }, []);

  const loadAllServices = async () => {
    setLoading(true);
    try {
      const [elecData, tvData, examData, cashTxs] = await Promise.all([
        apiRequest<ElectricityProvider[]>('/admin/electricity-providers'),
        apiRequest<TvProvider[]>('/admin/tv-providers'),
        apiRequest<ExamPinProduct[]>('/admin/exam-pins'),
        apiRequest<AirtimeCashRequest[]>('/admin/airtime-cash/requests')
      ]);

      setElectricity(elecData || []);
      setTv(tvData || []);
      setExamPins(examData || []);
      setAirtimeCashRequests(cashTxs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load services data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveElectricity = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/admin/electricity-providers', {
        method: 'PUT',
        body: JSON.stringify({ providers: electricity })
      });
      setMessage('Electricity providers saved.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTv = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/admin/tv-providers', {
        method: 'PUT',
        body: JSON.stringify({ providers: tv })
      });
      setMessage('TV providers and packages saved.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExamPins = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/admin/exam-pins', {
        method: 'PUT',
        body: JSON.stringify({ products: examPins })
      });
      setMessage('Exam PIN products saved.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAirtimeCashAction = async (txId: string, action: 'APPROVE' | 'REJECT') => {
    setActionLoadingId(txId);
    try {
      await apiRequest(`/admin/airtime-cash/requests/${txId}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          rejectionReason: action === 'REJECT' ? 'Airtime transfer not confirmed by receiver' : undefined
        })
      });
      setMessage(`Request ${action === 'APPROVE' ? 'Approved & Wallet Credited' : 'Rejected'}.`);
      setTimeout(() => setMessage(null), 3500);
      loadAllServices();
    } catch (err: any) {
      setError(err.message || 'Failed to process request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Loading service configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-white">
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

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setSubTab('electricity')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'electricity' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Electricity Discos ({electricity.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('tv')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'tv' ? 'bg-purple-500 text-slate-950' : 'bg-slate-900 text-slate-400'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>TV Cables ({tv.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('exam')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'exam' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Exam PINs ({examPins.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('airtimeCash')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'airtimeCash' ? 'bg-blue-500 text-slate-950' : 'bg-slate-900 text-slate-400'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Airtime-to-Cash ({airtimeCashRequests.length})</span>
        </button>
      </div>

      {/* ELECTRICITY TAB */}
      {subTab === 'electricity' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
            {electricity.map((item, index) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white text-sm">{item.name}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Provider ID: {item.id}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Fee (₦)</label>
                    <input
                      type="number"
                      value={item.fee}
                      onChange={(e) => {
                        const updated = [...electricity];
                        updated[index].fee = Number(e.target.value) || 0;
                        setElectricity(updated);
                      }}
                      className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Status</label>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...electricity];
                        updated[index].enabled = !updated[index].enabled;
                        setElectricity(updated);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        item.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {item.enabled ? 'ACTIVE' : 'OFFLINE'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveElectricity}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Electricity Configuration</span>
          </button>
        </div>
      )}

      {/* TV TAB */}
      {subTab === 'tv' && (
        <div className="space-y-4">
          <div className="space-y-4">
            {tv.map((provider, pIdx) => (
              <div key={provider.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{provider.name}</h4>
                    <p className="text-[11px] text-slate-400">{provider.packages.length} packages</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...tv];
                      updated[pIdx].enabled = !updated[pIdx].enabled;
                      setTv(updated);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      provider.enabled ? 'bg-purple-500/20 text-purple-300' : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {provider.enabled ? 'PROVIDER ACTIVE' : 'OFFLINE'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {provider.packages.map((pkg, pkgIdx) => (
                    <div
                      key={pkg.id}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <span className="font-medium text-slate-300">{pkg.name}</span>
                      <div className="flex items-center gap-1 font-mono">
                        <span className="text-slate-400">₦</span>
                        <input
                          type="number"
                          value={pkg.price}
                          onChange={(e) => {
                            const updated = [...tv];
                            updated[pIdx].packages[pkgIdx].price = Number(e.target.value) || 0;
                            setTv(updated);
                          }}
                          className="w-20 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-right text-emerald-400 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveTv}
            disabled={saving}
            className="w-full py-2.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save TV Configuration</span>
          </button>
        </div>
      )}

      {/* EXAM PINS TAB */}
      {subTab === 'exam' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
            {examPins.map((item, index) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white text-sm">{item.name}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Product ID: {item.id}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Selling Price (₦)</label>
                    <input
                      type="number"
                      value={item.sellingPrice}
                      onChange={(e) => {
                        const updated = [...examPins];
                        updated[index].sellingPrice = Number(e.target.value) || 0;
                        setExamPins(updated);
                      }}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Status</label>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...examPins];
                        updated[index].enabled = !updated[index].enabled;
                        setExamPins(updated);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        item.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {item.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveExamPins}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Exam PIN Prices</span>
          </button>
        </div>
      )}

      {/* AIRTIME TO CASH REQUESTS TAB */}
      {subTab === 'airtimeCash' && (
        <div className="space-y-3">
          {airtimeCashRequests.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
              No Airtime-to-Cash conversion requests submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {airtimeCashRequests.map((req) => (
                <div key={req.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">
                        {req.metadata?.network} ₦{req.metadata?.amountToTransfer?.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Sender: {req.userEmail} ({req.metadata?.senderPhone})
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        req.status === 'Successful'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : req.status === 'Failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Airtime Sent:</span>
                      <span className="font-mono text-white">₦{req.metadata?.amountToTransfer?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Rate:</span>
                      <span className="font-mono text-amber-400">{req.metadata?.ratePercent}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cash Payout:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        ₦{req.metadata?.cashPayout?.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {req.status === 'Pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={actionLoadingId === req.id}
                        onClick={() => handleAirtimeCashAction(req.id, 'APPROVE')}
                        className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs transition-colors"
                      >
                        {actionLoadingId === req.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Confirm Received &amp; Credit Wallet</span>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoadingId === req.id}
                        onClick={() => handleAirtimeCashAction(req.id, 'REJECT')}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
