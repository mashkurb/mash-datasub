import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Phone,
  Building2,
  CheckCircle2,
  Wallet,
  Clock,
  XCircle,
  Copy,
  Check,
  Loader2,
  ListOrdered
} from 'lucide-react';
import { UserProfile, AirtimeCashSettings, AirtimeCashRequest } from '../../types';
import { apiRequest } from '../../api';
import { sanitizeNigerianPhoneInput, validateNigerianPhone } from '../../utils/phoneValidation';

interface AirtimeToCashViewProps {
  user: UserProfile;
  onBack: () => void;
}

export const AirtimeToCashView: React.FC<AirtimeToCashViewProps> = ({ user, onBack }) => {
  const [viewTab, setViewTab] = useState<'convert' | 'history'>('convert');
  const [config, setConfig] = useState<AirtimeCashSettings | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Form State
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [senderPhone, setSenderPhone] = useState(user.phone || '');
  const [airtimeAmount, setAirtimeAmount] = useState('2000');
  const [payoutDestination, setPayoutDestination] = useState<'WALLET' | 'BANK'>('WALLET');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState(user.fullName || '');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<AirtimeCashRequest | null>(null);
  const [createdInstructions, setCreatedInstructions] = useState<{ adminPhone: string; transferCode: string; reference: string } | null>(null);
  const [copiedSim, setCopiedSim] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History State
  const [myRequests, setMyRequests] = useState<AirtimeCashRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (viewTab === 'history') {
      fetchHistory();
    }
  }, [viewTab]);

  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await apiRequest<{ success: boolean; settings: AirtimeCashSettings }>('/airtime-cash/config');
      setConfig(res.settings);
    } catch (err: any) {
      setError(err.message || 'Failed to load airtime conversion rates.');
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await apiRequest<{ success: boolean; requests: AirtimeCashRequest[] }>('/airtime-cash/my-requests');
      setMyRequests(res.requests || []);
    } catch {
      // silent fail on history
    } finally {
      setLoadingHistory(false);
    }
  };

  const rate = config ? config.rates[network] || 80 : 80;
  const numAmount = Number(airtimeAmount) || 0;
  const rawPayout = Math.round(numAmount * (rate / 100));
  const fee = config?.fee || 0;
  const finalPayout = Math.max(0, rawPayout - fee);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const phoneValidation = validateNigerianPhone(senderPhone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Invalid Nigerian phone number.');
      return;
    }

    const min = config?.minAmount || 1000;
    const max = config?.maxAmount || 50000;

    if (numAmount < min) {
      setError(`Minimum airtime amount to convert is ₦${min.toLocaleString()}.`);
      return;
    }
    if (numAmount > max) {
      setError(`Maximum airtime amount per transaction is ₦${max.toLocaleString()}.`);
      return;
    }

    if (payoutDestination === 'BANK') {
      if (!accountNumber || accountNumber.length < 10) {
        setError('Please provide a valid 10-digit bank account number.');
        return;
      }
      if (!bankName || !accountName) {
        setError('Please enter both bank name and beneficiary account name.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        request: AirtimeCashRequest;
        instructions: { adminPhone: string; transferCode: string; reference: string };
      }>('/airtime-cash/requests', {
        method: 'POST',
        body: JSON.stringify({
          network,
          senderPhone: senderPhone.trim(),
          amount: numAmount,
          payoutDestination,
          bankDetails: payoutDestination === 'BANK' ? {
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountName: accountName.trim()
          } : undefined
        })
      });

      setCreatedRequest(res.request);
      setCreatedInstructions(res.instructions);
    } catch (err: any) {
      setError(err.message || 'Failed to submit airtime conversion request.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSim(true);
    setTimeout(() => setCopiedSim(false), 2500);
  };

  const getStatusBadge = (status: AirtimeCashRequest['status']) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending Admin Review
          </span>
        );
      case 'Approved':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'Completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Paid &amp; Credited
          </span>
        );
      case 'Rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-white">
      {/* Top Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3.5 sticky top-0 z-20 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
        <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4 text-emerald-400" />
          <span>Airtime to Cash</span>
        </h2>
        <div className="w-12" />
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-5">
        {/* Navigation Tabs (Convert vs History) */}
        <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setViewTab('convert');
              setCreatedRequest(null);
            }}
            className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              viewTab === 'convert' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Convert Airtime</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('history')}
            className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              viewTab === 'history' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>My Requests ({myRequests.length})</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* TAB 1: CONVERT FORM & SUCCESS SCREEN */}
        {viewTab === 'convert' && (
          <>
            {createdRequest && createdInstructions ? (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Conversion Request Logged</h3>
                  <p className="text-xs text-slate-400">
                    Your request has been submitted to the Mash DataSub administration portal.
                  </p>
                </div>

                {/* Transfer Details Card */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                    <span className="text-slate-400 font-medium">Tracking Reference:</span>
                    <span className="font-mono font-bold text-emerald-400">{createdRequest.reference}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Airtime to Transfer:</span>
                    <span className="font-black text-amber-400 text-sm">
                      ₦{createdRequest.airtimeAmount.toLocaleString()} ({createdRequest.network})
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-medium">Payout to Receive:</span>
                    <span className="font-black text-emerald-400 text-sm">
                      ₦{createdRequest.expectedPayout.toLocaleString()} ({createdRequest.payoutDestination})
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-900 space-y-1.5">
                    <div className="text-slate-400 text-[11px] font-semibold uppercase">Mash Merchant SIM Number:</div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="font-mono font-bold text-base text-white">{createdInstructions.adminPhone}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(createdInstructions.adminPhone)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-md flex items-center gap-1 transition-colors"
                      >
                        {copiedSim ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSim ? 'Copied!' : 'Copy SIM'}</span>
                      </button>
                    </div>
                  </div>

                  {createdInstructions.transferCode && (
                    <div className="pt-1 text-[11px] text-slate-400 leading-relaxed">
                      <span className="font-bold text-slate-300">How to send: </span>
                      Dial {createdInstructions.transferCode} on your {createdRequest.network} line.
                    </div>
                  )}
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 space-y-1">
                  <p className="font-bold">Next Steps:</p>
                  <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                    Once you transfer the airtime from your phone, our administrator will verify the incoming transfer on our merchant SIM and disburse your funds.
                    {createdRequest.payoutDestination === 'WALLET' ? ' Your Mash DataSub wallet balance will be credited automatically.' : ' Your registered bank account will receive the transfer directly.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setViewTab('history')}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl text-center"
                  >
                    View Status in My Requests
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedRequest(null);
                      setCreatedInstructions(null);
                    }}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white text-center"
                  >
                    Submit Another Request
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. Network Selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    1. Select Network
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map(net => {
                      const netRate = config?.rates[net] || 80;
                      return (
                        <button
                          key={net}
                          type="button"
                          onClick={() => setNetwork(net)}
                          className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                            network === net
                              ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/20'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-black">{net}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">{netRate}% Payout</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Sender Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    2. Airtime Sending Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={senderPhone}
                    onChange={e => setSenderPhone(sanitizeNigerianPhoneInput(e.target.value))}
                    placeholder="08012345678"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The SIM phone number from which you will share/transfer the airtime.
                  </p>
                </div>

                {/* 3. Amount */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    3. Airtime Amount to Convert (₦)
                  </label>
                  <input
                    type="number"
                    min={config?.minAmount || 1000}
                    max={config?.maxAmount || 50000}
                    step={100}
                    required
                    value={airtimeAmount}
                    onChange={e => setAirtimeAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-base font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <div className="mt-2 p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Conversion Rate:</span>
                      <span className="font-bold text-white">{rate}%</span>
                    </div>
                    {fee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Processing Fee:</span>
                        <span className="font-bold text-slate-300">₦{fee}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-slate-800 text-sm">
                      <span className="text-slate-300 font-medium">Cash Payout:</span>
                      <span className="font-black text-emerald-400">₦{finalPayout.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Payout Destination */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    4. Choose Payout Destination
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPayoutDestination('WALLET')}
                      className={`p-3.5 rounded-xl border text-left transition-all space-y-1 ${
                        payoutDestination === 'WALLET'
                          ? 'bg-emerald-500/10 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                        <Wallet className="w-4 h-4" />
                        <span>Mash Wallet</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Instant credit upon approval. Use to buy data or airtime immediately.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayoutDestination('BANK')}
                      className={`p-3.5 rounded-xl border text-left transition-all space-y-1 ${
                        payoutDestination === 'BANK'
                          ? 'bg-blue-500/10 border-blue-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-blue-400">
                        <Building2 className="w-4 h-4" />
                        <span>Bank Account</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Direct transfer to any Nigerian commercial bank account.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Bank Details Input (Only if BANK is selected) */}
                {payoutDestination === 'BANK' && (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
                    <div className="font-bold text-slate-300">Bank Account Details</div>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      placeholder="Bank Name (e.g. OPay, Kuda, GTBank, Zenith)"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                    <input
                      type="text"
                      required
                      maxLength={10}
                      value={accountNumber}
                      onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="10-Digit Account Number"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      placeholder="Account Holder Name"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Logging Request...</span>
                    </>
                  ) : (
                    <>
                      <span>Proceed to Transfer Airtime</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </>
        )}

        {/* TAB 2: MY REQUESTS HISTORY */}
        {viewTab === 'history' && (
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Loading your requests...</span>
              </div>
            ) : myRequests.length === 0 ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <RefreshCw className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">You have not submitted any airtime conversion requests yet.</p>
                <button
                  type="button"
                  onClick={() => setViewTab('convert')}
                  className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Convert Airtime Now
                </button>
              </div>
            ) : (
              myRequests.map(r => (
                <div key={r.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-white">
                        {r.network}
                      </span>
                      <span className="font-mono font-bold text-white">{r.reference}</span>
                    </div>
                    {getStatusBadge(r.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Airtime Sent</span>
                      <span className="font-bold text-amber-400">₦{r.airtimeAmount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cash Payout</span>
                      <span className="font-bold text-emerald-400">₦{r.expectedPayout.toLocaleString()} ({r.payoutDestination})</span>
                    </div>
                  </div>

                  {r.adminNotes && (
                    <div className="p-2 bg-slate-800/40 rounded-lg text-[11px] text-slate-300">
                      <span className="text-slate-400 font-semibold">Status note: </span>
                      {r.adminNotes}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 font-mono text-right">
                    Submitted: {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
