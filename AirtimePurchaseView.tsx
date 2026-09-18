import React, { useState } from 'react';
import { Smartphone, ArrowLeft, ArrowRight, Loader2, AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';
import { PaymentConfirmationModal } from './PaymentConfirmationModal';
import { sanitizeNigerianPhoneInput, validateNigerianPhone } from '../../utils/phoneValidation';

interface AirtimePurchaseViewProps {
  user: UserProfile;
  onBack: () => void;
  onSuccess: (receipt: ReceiptData, newBalance: number) => void;
  onPromptSetPin: () => void;
  onOpenFundWallet?: () => void;
}

export const AirtimePurchaseView: React.FC<AirtimePurchaseViewProps> = ({
  user,
  onBack,
  onSuccess,
  onPromptSetPin,
  onOpenFundWallet
}) => {
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [phone, setPhone] = useState(sanitizeNigerianPhoneInput(user.phone || ''));
  const [amount, setAmount] = useState('500');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networks: Array<{ id: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'; label: string; color: string }> = [
    { id: 'MTN', label: 'MTN', color: 'bg-amber-500 text-slate-950 font-black' },
    { id: 'AIRTEL', label: 'Airtel', color: 'bg-red-600 text-white font-black' },
    { id: 'GLO', label: 'Glo', color: 'bg-emerald-600 text-white font-black' },
    { id: '9MOBILE', label: '9mobile', color: 'bg-lime-500 text-slate-950 font-black' }
  ];

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  const rechargeAmount = Number(amount) || 0;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rechargeAmount < 50) {
      setError('Minimum airtime recharge amount is ₦50.');
      return;
    }

    const phoneValidation = validateNigerianPhone(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.errorMessage || 'Please enter a valid 11-digit Nigerian phone number.');
      return;
    }

    if (!user.hasPin) {
      onPromptSetPin();
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmWithPin = async (inputPin: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        success: boolean;
        reference: string;
        network: string;
        amount: number;
        recipient: string;
        newBalance: number;
        date: string;
        message: string;
      }>('/services/airtime/purchase', {
        method: 'POST',
        body: JSON.stringify({
          network,
          phone: phone.trim(),
          amount: rechargeAmount,
          pin: inputPin
        })
      });

      setShowConfirm(false);
      const receipt: ReceiptData = {
        title: 'Airtime Recharge',
        service: `${data.network} Airtime Top-up`,
        reference: data.reference,
        amount: data.amount,
        status: 'Successful',
        date: data.date,
        recipient: data.recipient,
        details: {
          Network: data.network,
          Amount: `₦${data.amount.toLocaleString()}`,
          Recipient: data.recipient
        }
      };
      onSuccess(receipt, data.newBalance);
    } catch (err: any) {
      throw new Error(err.message || 'Recharge failed. Please check your PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-white">
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
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>Airtime Recharge</span>
        </h2>
        <div className="w-10" />
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-5">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            1. Select Network
          </label>
          <div className="grid grid-cols-4 gap-2">
            {networks.map((net) => (
              <button
                key={net.id}
                type="button"
                onClick={() => setNetwork(net.id)}
                className={`py-3 px-2 rounded-xl text-xs font-bold transition-all border ${
                  network === net.id
                    ? `${net.color} border-transparent shadow-lg scale-[1.02]`
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                {net.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            2. Recipient Phone Number
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(sanitizeNigerianPhoneInput(e.target.value))}
              placeholder="e.g. 08081419276"
              className="w-full pl-4 pr-20 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm font-medium font-mono focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPhone(sanitizeNigerianPhoneInput(user.phone || ''))}
              className="absolute inset-y-1.5 right-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg"
            >
              My Phone
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">11 digits starting with 07, 08, or 09</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            3. Recharge Amount (₦)
          </label>
          <input
            type="number"
            min={50}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-lg font-bold font-mono focus:border-emerald-500 focus:outline-none"
          />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt.toString())}
                className="py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300"
              >
                ₦{amt}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all"
        >
          <span>Continue to Confirmation</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Centralized Payment Confirmation & PIN Modal */}
      <PaymentConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        serviceTitle={`${network} Airtime Recharge`}
        details={[
          { label: 'Network Provider', value: network },
          { label: 'Service', value: 'Airtime Top-up' },
          { label: 'Recipient Phone', value: phone },
          { label: 'Airtime Amount', value: `₦${rechargeAmount.toLocaleString()}`, isHighlight: true }
        ]}
        totalAmount={rechargeAmount}
        userBalance={user.walletBalance}
        hasPin={user.hasPin}
        onPromptSetPin={onPromptSetPin}
        onOpenFundWallet={onOpenFundWallet || onPromptSetPin}
        onConfirmWithPin={handleConfirmWithPin}
        isProcessing={loading}
        error={error}
        onClearError={() => setError(null)}
      />
    </div>
  );
};
