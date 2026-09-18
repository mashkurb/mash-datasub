import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Smartphone, CheckCircle2, AlertCircle, Loader2, Save, ShieldCheck, DollarSign, Calculator } from 'lucide-react';
import { apiRequest } from '../../api';

export const TransfersAndPricingTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [savingAirtime, setSavingAirtime] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Transfer Settings State
  const [transferEnabled, setTransferEnabled] = useState(true);
  const [customerToCustomerTransferEnabled, setCustomerToCustomerTransferEnabled] = useState(true);
  const [transferFeeType, setTransferFeeType] = useState<'free' | 'flat' | 'percentage'>('flat');
  const [transferFixedFee, setTransferFixedFee] = useState('50');
  const [transferPercentFee, setTransferPercentFee] = useState('0');
  const [transferFeePayer, setTransferFeePayer] = useState<'SENDER' | 'RECIPIENT'>('SENDER');
  const [minTransferAmount, setMinTransferAmount] = useState('50');
  const [maxTransferAmount, setMaxTransferAmount] = useState('200000');
  const [dailyTransferLimit, setDailyTransferLimit] = useState('500000');

  // Interactive preview amount
  const [previewAmount, setPreviewAmount] = useState('1000');

  // Airtime Pricing State
  const [customerDiscountPercent, setCustomerDiscountPercent] = useState('2');
  const [airtimeServiceFee, setAirtimeServiceFee] = useState('0');
  const [generalTransactionChargePercent, setGeneralTransactionChargePercent] = useState('0');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [transferData, airtimeData] = await Promise.all([
        apiRequest<{
          transferEnabled: boolean;
          customerToCustomerTransferEnabled?: boolean;
          transferFeeType: 'free' | 'flat' | 'percentage';
          transferFixedFee?: number;
          transferPercentFee?: number;
          transferFeePayer?: 'SENDER' | 'RECIPIENT';
          minTransferAmount?: number;
          maxTransferAmount?: number;
          dailyTransferLimit?: number;
          transferCharge?: number;
        }>('/admin/transfer-settings'),
        apiRequest<{
          customerDiscountPercent: number;
          serviceFee: number;
          generalTransactionChargePercent: number;
        }>('/admin/airtime-pricing')
      ]);

      if (transferData) {
        setTransferEnabled(transferData.transferEnabled !== false);
        setCustomerToCustomerTransferEnabled(transferData.customerToCustomerTransferEnabled !== false);
        setTransferFeeType(transferData.transferFeeType || 'flat');
        setTransferFixedFee((transferData.transferFixedFee ?? transferData.transferCharge ?? 50).toString());
        setTransferPercentFee((transferData.transferPercentFee ?? 0).toString());
        setTransferFeePayer(transferData.transferFeePayer || 'SENDER');
        setMinTransferAmount((transferData.minTransferAmount ?? 50).toString());
        setMaxTransferAmount((transferData.maxTransferAmount ?? 200000).toString());
        setDailyTransferLimit((transferData.dailyTransferLimit ?? 500000).toString());
      }

      if (airtimeData) {
        setCustomerDiscountPercent((airtimeData.customerDiscountPercent ?? 2).toString());
        setAirtimeServiceFee((airtimeData.serviceFee ?? 0).toString());
        setGeneralTransactionChargePercent((airtimeData.generalTransactionChargePercent ?? 0).toString());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load transfer and pricing settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTransfer(true);
    setError(null);
    setMessage(null);

    try {
      await apiRequest('/admin/transfer-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: transferEnabled,
          transferEnabled,
          customerToCustomerTransferEnabled,
          feeType: transferFeeType,
          transferFeeType,
          fixedFee: Number(transferFixedFee) || 0,
          transferFixedFee: Number(transferFixedFee) || 0,
          percentFee: Number(transferPercentFee) || 0,
          transferPercentFee: Number(transferPercentFee) || 0,
          feePayer: transferFeePayer,
          transferFeePayer,
          minTransferAmount: Number(minTransferAmount) || 0,
          maxTransferAmount: Number(maxTransferAmount) || 0,
          dailyTransferLimit: Number(dailyTransferLimit) || 0
        })
      });

      setMessage('Transfer rules updated successfully. All customer transfers immediately use these settings.');
      setTimeout(() => setMessage(null), 4000);
      loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to save transfer settings.');
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleSaveAirtime = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAirtime(true);
    setError(null);
    setMessage(null);

    try {
      await apiRequest('/admin/airtime-pricing', {
        method: 'PUT',
        body: JSON.stringify({
          pricing: {
            customerDiscountPercent: Number(customerDiscountPercent) || 0,
            serviceFee: Number(airtimeServiceFee) || 0,
            generalTransactionChargePercent: Number(generalTransactionChargePercent) || 0
          }
        })
      });

      setMessage('Airtime pricing and customer discounts updated successfully.');
      setTimeout(() => setMessage(null), 3500);
      loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to save airtime pricing.');
    } finally {
      setSavingAirtime(false);
    }
  };

  // Calculate live preview metrics
  const pAmt = Math.max(0, Number(previewAmount) || 0);
  let pFee = 0;
  if (transferFeeType === 'free') {
    pFee = 0;
  } else if (transferFeeType === 'percentage') {
    pFee = Math.round((pAmt * ((Number(transferPercentFee) || 0) / 100)) * 100) / 100;
  } else {
    pFee = Math.round((Number(transferFixedFee) || 0) * 100) / 100;
  }

  let pSenderDeduction = 0;
  let pRecipientReceipt = 0;

  if (transferFeePayer === 'SENDER') {
    pSenderDeduction = pAmt + pFee;
    pRecipientReceipt = pAmt;
  } else {
    pSenderDeduction = pAmt;
    pRecipientReceipt = Math.max(0, pAmt - pFee);
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Loading transfer &amp; pricing configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
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

      {/* User-to-User Transfer Controls */}
      <form onSubmit={handleSaveTransfer} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Wallet-to-Wallet Transfer Rules &amp; Fees</h3>
              <p className="text-[11px] text-slate-400">Configure peer-to-peer transfer charges, limits, and fee deduction modes</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                checked={customerToCustomerTransferEnabled && transferEnabled}
                onChange={(e) => {
                  setTransferEnabled(e.target.checked);
                  setCustomerToCustomerTransferEnabled(e.target.checked);
                }}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
              />
              <span className="font-bold">
                {transferEnabled && customerToCustomerTransferEnabled ? (
                  <span className="text-emerald-400">Transfers Active</span>
                ) : (
                  <span className="text-red-400">Transfers Paused</span>
                )}
              </span>
            </label>
          </div>
        </div>

        {/* Fee Structure Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Fee Type
            </label>
            <select
              value={transferFeeType}
              onChange={(e) => setTransferFeeType(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold focus:border-emerald-500"
            >
              <option value="flat">Flat Fee (₦)</option>
              <option value="percentage">Percentage Fee (%)</option>
              <option value="free">Free Transfers (₦0)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              {transferFeeType === 'percentage' ? 'Fee Percentage (%)' : 'Flat Fee Amount (₦)'}
            </label>
            {transferFeeType === 'percentage' ? (
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={transferPercentFee}
                onChange={(e) => setTransferPercentFee(e.target.value)}
                placeholder="1.0"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500"
              />
            ) : (
              <input
                type="number"
                min={0}
                step={1}
                disabled={transferFeeType === 'free'}
                value={transferFeeType === 'free' ? '0' : transferFixedFee}
                onChange={(e) => setTransferFixedFee(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500 disabled:opacity-50"
              />
            )}
          </div>

          {/* Fee Payer Rule: SENDER vs RECIPIENT */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Fee Payer Mode (Admin Rule)
            </label>
            <select
              value={transferFeePayer}
              onChange={(e) => setTransferFeePayer(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold focus:border-emerald-500"
            >
              <option value="SENDER">Option A: Sender Pays Fee (Deduct from sender)</option>
              <option value="RECIPIENT">Option B: Recipient Pays Fee (Deduct from amount received)</option>
            </select>
          </div>
        </div>

        {/* Transfer Limits: Min, Max, Daily */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Minimum Transfer (₦)
            </label>
            <input
              type="number"
              min={10}
              step={10}
              value={minTransferAmount}
              onChange={(e) => setMinTransferAmount(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Maximum Per Transfer (₦)
            </label>
            <input
              type="number"
              min={100}
              step={1000}
              value={maxTransferAmount}
              onChange={(e) => setMaxTransferAmount(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Daily Transfer Limit (₦)
            </label>
            <input
              type="number"
              min={1000}
              step={5000}
              value={dailyTransferLimit}
              onChange={(e) => setDailyTransferLimit(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Live Calculation Simulator */}
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>Interactive Rule Simulator</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px]">Test Amount:</span>
              <input
                type="number"
                min={50}
                value={previewAmount}
                onChange={(e) => setPreviewAmount(e.target.value)}
                className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono font-bold text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-850">
            <div className="p-2.5 bg-slate-900/90 rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">Transfer Amount</span>
              <span className="font-mono font-extrabold text-white text-sm">₦{pAmt.toLocaleString()}</span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">Calculated Fee</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                ₦{pFee.toLocaleString()} ({transferFeeType})
              </span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">Deducted from Sender</span>
              <span className="font-mono font-extrabold text-amber-400 text-sm">
                ₦{pSenderDeduction.toLocaleString()}
              </span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded-xl">
              <span className="text-[10px] text-slate-400 block uppercase">Credited to Recipient</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                ₦{pRecipientReceipt.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 italic">
            {transferFeePayer === 'SENDER' ? (
              <span>
                &bull; <strong>Option A Active:</strong> The customer transfers ₦{pAmt.toLocaleString()} with a ₦{pFee.toLocaleString()} fee. The sender pays <strong>₦{pSenderDeduction.toLocaleString()}</strong> and the recipient gets <strong>₦{pRecipientReceipt.toLocaleString()}</strong> in full.
              </span>
            ) : (
              <span>
                &bull; <strong>Option B Active:</strong> The customer transfers ₦{pAmt.toLocaleString()} with a ₦{pFee.toLocaleString()} fee. The sender pays <strong>₦{pSenderDeduction.toLocaleString()}</strong> and the recipient receives <strong>₦{pRecipientReceipt.toLocaleString()}</strong> (fee deducted from credit).
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={savingTransfer}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-emerald-500/20"
        >
          {savingTransfer ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Transfer Rules...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save &amp; Apply Transfer Rules</span>
            </>
          )}
        </button>
      </form>

      {/* Airtime Pricing & Discount Card */}
      <form onSubmit={handleSaveAirtime} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Airtime Pricing &amp; Customer Discount</h3>
            <p className="text-[11px] text-slate-400">Dynamic discount rates applied to customer VTU recharges</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Customer Discount (%)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              required
              value={customerDiscountPercent}
              onChange={(e) => setCustomerDiscountPercent(e.target.value)}
              placeholder="2"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">e.g. 2% discount means ₦1000 airtime costs ₦980.</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Flat Service Fee (₦)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              required
              value={airtimeServiceFee}
              onChange={(e) => setAirtimeServiceFee(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Default ₦0 flat fee.</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              General Transaction Charge (%)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              required
              value={generalTransactionChargePercent}
              onChange={(e) => setGeneralTransactionChargePercent(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Optional general charge (default 0%).</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={savingAirtime}
          className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-all"
        >
          {savingAirtime ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Updating Airtime Pricing...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Airtime Pricing</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

