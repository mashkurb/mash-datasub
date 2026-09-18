import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  ArrowRight,
  Wallet,
  Building2,
  Phone,
  Sliders,
  Save,
  Check,
  X,
  FileText
} from 'lucide-react';
import { apiRequest } from './api';
import { AirtimeCashRequest, AirtimeCashSettings } from '../../types';

export const AirtimeCashTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'settings'>('requests');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'Approved' | 'Completed' | 'Rejected'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [requests, setRequests] = useState<AirtimeCashRequest[]>([]);
  const [settings, setSettings] = useState<AirtimeCashSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal / action state
  const [selectedRequest, setSelectedRequest] = useState<AirtimeCashRequest | null>(null);
  const [actionModalType, setActionModalType] = useState<'approve' | 'reject' | 'complete' | 'note' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actualReceived, setActualReceived] = useState('');

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqData, settsData] = await Promise.all([
        apiRequest<{ success: boolean; requests: AirtimeCashRequest[] }>(
          `/admin/airtime-cash/requests${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`
        ),
        apiRequest<{ success: boolean; settings: AirtimeCashSettings }>('/admin/airtime-cash/settings')
      ]);

      setRequests(reqData.requests || []);
      setSettings(settsData.settings);
    } catch (err: any) {
      setError(err.message || 'Failed to load Airtime to Cash data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string; settings: AirtimeCashSettings }>(
        '/admin/airtime-cash/settings',
        {
          method: 'PUT',
          body: JSON.stringify(settings)
        }
      );
      setSettings(res.settings);
      setMessage('Airtime-to-Cash settings updated successfully.');
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    setActionLoadingId(selectedRequest.id);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string; walletUpdated: boolean; newBalance?: number }>(
        `/admin/airtime-cash/requests/${selectedRequest.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            actualReceivedAmount: actualReceived ? Number(actualReceived) : undefined,
            notes: actionNotes
          })
        }
      );
      setMessage(res.message);
      setTimeout(() => setMessage(null), 4000);
      closeActionModal();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleComplete = async () => {
    if (!selectedRequest) return;
    setActionLoadingId(selectedRequest.id);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/admin/airtime-cash/requests/${selectedRequest.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: actionNotes })
        }
      );
      setMessage(res.message);
      setTimeout(() => setMessage(null), 4000);
      closeActionModal();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to complete request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setActionLoadingId(selectedRequest.id);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/admin/airtime-cash/requests/${selectedRequest.id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: actionNotes || 'Airtime transfer not verified' })
        }
      );
      setMessage(res.message);
      setTimeout(() => setMessage(null), 4000);
      closeActionModal();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openActionModal = (req: AirtimeCashRequest, type: 'approve' | 'reject' | 'complete' | 'note') => {
    setSelectedRequest(req);
    setActionModalType(type);
    setActionNotes(req.adminNotes || '');
    setActualReceived(String(req.airtimeAmount));
  };

  const closeActionModal = () => {
    setSelectedRequest(null);
    setActionModalType(null);
    setActionNotes('');
    setActualReceived('');
  };

  const filteredRequests = requests.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.reference.toLowerCase().includes(q) ||
      r.customerEmail.toLowerCase().includes(q) ||
      r.customerPhone.toLowerCase().includes(q) ||
      r.senderPhone.toLowerCase().includes(q) ||
      r.network.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: AirtimeCashRequest['status']) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending Verification
          </span>
        );
      case 'Approved':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Approved (Awaiting Payout)
          </span>
        );
      case 'Completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Paid &amp; Completed
          </span>
        );
      case 'Rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  const getNetworkBadge = (net: string) => {
    const colors: Record<string, string> = {
      MTN: 'bg-amber-400 text-slate-950',
      AIRTEL: 'bg-red-500 text-white',
      GLO: 'bg-emerald-500 text-white',
      '9MOBILE': 'bg-lime-600 text-white'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${colors[net] || 'bg-slate-700 text-white'}`}>
        {net}
      </span>
    );
  };

  return (
    <div className="space-y-5 text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-emerald-400" />
            <span>Airtime-to-Cash Operations</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage customer airtime conversion requests, approve payouts, and configure live rates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('requests')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === 'requests'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Conversion Requests ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'settings'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>SIM &amp; Rates Config</span>
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

      {/* SUBTAB 1: REQUESTS WORKFLOW */}
      {activeSubTab === 'requests' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Status Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
              {(['ALL', 'Pending', 'Approved', 'Completed', 'Rejected'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                    statusFilter === tab
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search reference, email, phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Table of Requests */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading conversion requests...</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-semibold">No conversion requests found in this category.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map(req => (
                <div
                  key={req.id}
                  className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-3 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {getNetworkBadge(req.network)}
                      <span className="font-mono font-bold text-xs text-white">{req.reference}</span>
                      {getStatusBadge(req.status)}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(req.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  {/* Financial & User details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Customer</div>
                      <div className="font-bold text-white truncate">{req.customerName || req.customerEmail}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{req.senderPhone}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Airtime Amount</div>
                      <div className="font-black text-amber-400 text-sm">₦{req.airtimeAmount.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">Rate: {req.rate}%</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Payout Cash</div>
                      <div className="font-black text-emerald-400 text-sm">₦{req.expectedPayout.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        {req.payoutDestination === 'WALLET' ? (
                          <>
                            <Wallet className="w-3 h-3 text-emerald-400" />
                            <span>Mash Wallet</span>
                          </>
                        ) : (
                          <>
                            <Building2 className="w-3 h-3 text-blue-400" />
                            <span>Bank Transfer</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Recipient SIM</div>
                      <div className="font-mono text-xs text-slate-300">{req.recipientPhone}</div>
                      {req.bankDetails && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {req.bankDetails.bankName} - {req.bankDetails.accountNumber}
                        </div>
                      )}
                    </div>
                  </div>

                  {req.adminNotes && (
                    <div className="p-2.5 bg-slate-800/40 border border-slate-700/50 rounded-xl text-[11px] text-slate-300">
                      <span className="font-bold text-slate-400">Internal Note: </span>
                      {req.adminNotes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => openActionModal(req, 'note')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Note</span>
                    </button>

                    {req.status === 'Pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openActionModal(req, 'reject')}
                          className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(req, 'approve')}
                          className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {req.payoutDestination === 'WALLET' ? 'Approve & Credit Wallet' : 'Approve for Bank Payout'}
                          </span>
                        </button>
                      </>
                    )}

                    {req.status === 'Approved' && req.payoutDestination === 'BANK' && (
                      <button
                        type="button"
                        onClick={() => openActionModal(req, 'complete')}
                        className="px-4 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-black flex items-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Bank Transfer Completed</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: SETTINGS & SIM CONFIG */}
      {activeSubTab === 'settings' && settings && (
        <div className="space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white">Master Service Status</h3>
                <p className="text-xs text-slate-400">Toggle whether customers can convert airtime to cash</p>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${
                  settings.enabled ? 'bg-emerald-500 text-slate-950' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {settings.enabled ? 'SERVICE ACTIVE' : 'SERVICE DISABLED'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Minimum Amount (₦)</label>
                <input
                  type="number"
                  value={settings.minAmount}
                  onChange={e => setSettings({ ...settings, minAmount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Maximum Amount (₦)</label>
                <input
                  type="number"
                  value={settings.maxAmount}
                  onChange={e => setSettings({ ...settings, maxAmount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Processing Fee (₦)</label>
                <input
                  type="number"
                  value={settings.fee}
                  onChange={e => setSettings({ ...settings, fee: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Network-specific SIM and Rates */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-sm font-black text-white">Conversion Rates &amp; Merchant SIMs</h3>
            <p className="text-xs text-slate-400">
              Enter the payout percentage and the merchant SIM phone number that receives airtime transfers.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => (
                <div key={net} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{net}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Customer receives {settings.rates[net]}% cash
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Payout Rate (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.rates[net]}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            rates: { ...settings.rates, [net]: Number(e.target.value) }
                          })
                        }
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Receiver SIM Phone</label>
                      <input
                        type="text"
                        value={settings.recipientPhones[net]}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            recipientPhones: { ...settings.recipientPhones, [net]: e.target.value }
                          })
                        }
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">USSD Share Code Template</label>
                    <input
                      type="text"
                      value={settings.transferCodes[net]}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          transferCodes: { ...settings.transferCodes, [net]: e.target.value }
                        })
                      }
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono text-[10px]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save All Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION MODAL (APPROVE / REJECT / COMPLETE / NOTE) */}
      {actionModalType && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                {actionModalType === 'approve' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {actionModalType === 'reject' && <XCircle className="w-4 h-4 text-red-400" />}
                {actionModalType === 'complete' && <Check className="w-4 h-4 text-blue-400" />}
                {actionModalType === 'note' && <FileText className="w-4 h-4 text-slate-400" />}
                <span>
                  {actionModalType === 'approve' && 'Approve & Credit Payout'}
                  {actionModalType === 'reject' && 'Reject Request'}
                  {actionModalType === 'complete' && 'Mark Bank Transfer Completed'}
                  {actionModalType === 'note' && 'Internal Request Note'}
                </span>
              </h3>
              <button type="button" onClick={closeActionModal} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Ref:</span>
                <span className="text-white">{selectedRequest.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="text-white">{selectedRequest.customerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Airtime:</span>
                <span className="text-amber-400 font-bold">₦{selectedRequest.airtimeAmount.toLocaleString()} ({selectedRequest.network})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payout:</span>
                <span className="text-emerald-400 font-bold">₦{selectedRequest.expectedPayout.toLocaleString()} ({selectedRequest.payoutDestination})</span>
              </div>
              {selectedRequest.bankDetails && (
                <div className="flex justify-between text-[11px] pt-1 border-t border-slate-900">
                  <span className="text-slate-500">Bank:</span>
                  <span className="text-slate-300">
                    {selectedRequest.bankDetails.bankName} - {selectedRequest.bankDetails.accountNumber} ({selectedRequest.bankDetails.accountName})
                  </span>
                </div>
              )}
            </div>

            {actionModalType === 'approve' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Actual Airtime Received (₦)
                  </label>
                  <input
                    type="number"
                    value={actualReceived}
                    onChange={e => setActualReceived(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    If customer sent less airtime than requested, adjust here to re-calculate exact payout.
                  </p>
                </div>

                {selectedRequest.payoutDestination === 'WALLET' ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                    <p className="font-bold">Instant Wallet Credit</p>
                    <p className="text-[11px] text-emerald-300 mt-0.5">
                      Approving this request will immediately credit ₦
                      {Math.round(Number(actualReceived || selectedRequest.airtimeAmount) * (selectedRequest.rate / 100)).toLocaleString()}{' '}
                      to the customer's Mash DataSub wallet balance atomically.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                    <p className="font-bold">Bank Transfer Payout</p>
                    <p className="text-[11px] text-blue-300 mt-0.5">
                      Please disburse ₦
                      {Math.round(Number(actualReceived || selectedRequest.airtimeAmount) * (selectedRequest.rate / 100)).toLocaleString()}{' '}
                      to the customer's bank account, then click "Mark Bank Transfer Completed".
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                {actionModalType === 'reject' ? 'Rejection Reason (visible to customer)' : 'Admin Notes'}
              </label>
              <textarea
                rows={2}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder={
                  actionModalType === 'reject'
                    ? 'e.g. Airtime transfer not found on destination SIM 08081419276'
                    : 'Optional internal notes...'
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeActionModal}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>

              {actionModalType === 'approve' && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionLoadingId === selectedRequest.id}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {actionLoadingId === selectedRequest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Confirm Approval</span>
                </button>
              )}

              {actionModalType === 'complete' && (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={actionLoadingId === selectedRequest.id}
                  className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  {actionLoadingId === selectedRequest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Confirm Payout Completed</span>
                </button>
              )}

              {actionModalType === 'reject' && (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionLoadingId === selectedRequest.id}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  {actionLoadingId === selectedRequest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  <span>Reject Request</span>
                </button>
              )}

              {actionModalType === 'note' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedRequest) return;
                    await apiRequest(`/admin/airtime-cash/requests/${selectedRequest.id}/note`, {
                      method: 'POST',
                      body: JSON.stringify({ notes: actionNotes })
                    });
                    closeActionModal();
                    loadData();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black"
                >
                  Save Note
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
