import React, { useState } from 'react';
import { Tv, ArrowLeft, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';
import { PaymentConfirmationModal } from './PaymentConfirmationModal';

interface TvCableViewProps {
  user: UserProfile;
  onBack: () => void;
  onSuccess: (receipt: ReceiptData, newBalance: number) => void;
  onPromptSetPin: () => void;
  onOpenFundWallet?: () => void;
}

export const TvCableView: React.FC<TvCableViewProps> = ({
  user,
  onBack,
  onSuccess,
  onPromptSetPin,
  onOpenFundWallet
}) => {
  const [provider, setProvider] = useState<'DSTV' | 'GOTV' | 'STARTIMES'>('GOTV');
  const [smartcard, setSmartcard] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packages: Record<'DSTV' | 'GOTV' | 'STARTIMES', Array<{ code: string; name: string; price: number }>> = {
    GOTV: [
      { code: 'gotv-smallie', name: 'GOtv Smallie', price: 1575 },
      { code: 'gotv-jinja', name: 'GOtv Jinja', price: 3300 },
      { code: 'gotv-jolli', name: 'GOtv Jolli', price: 4850 },
      { code: 'gotv-max', name: 'GOtv Max', price: 7200 },
      { code: 'gotv-supa', name: 'GOtv Supa', price: 9600 },
      { code: 'gotv-supa-plus', name: 'GOtv Supa Plus', price: 15700 }
    ],
    DSTV: [
      { code: 'dstv-padi', name: 'DStv Padi', price: 3600 },
      { code: 'dstv-yanga', name: 'DStv Yanga', price: 5100 },
      { code: 'dstv-confam', name: 'DStv Confam', price: 9300 },
      { code: 'dstv-compact', name: 'DStv Compact', price: 15700 },
      { code: 'dstv-compact-plus', name: 'DStv Compact Plus', price: 25000 },
      { code: 'dstv-premium', name: 'DStv Premium', price: 37000 }
    ],
    STARTIMES: [
      { code: 'startimes-nova', name: 'Nova (Dish/Antenna)', price: 1700 },
      { code: 'startimes-basic', name: 'Basic (Antenna)', price: 3000 },
      { code: 'startimes-smart', name: 'Smart (Dish)', price: 3800 },
      { code: 'startimes-classic', name: 'Classic (Antenna)', price: 4500 },
      { code: 'startimes-super', name: 'Super (Dish)', price: 8200 }
    ]
  };

  const [selectedPackageCode, setSelectedPackageCode] = useState(packages.GOTV[0].code);

  const currentPackages = packages[provider];
  const selectedPackage = currentPackages.find((p) => p.code === selectedPackageCode) || currentPackages[0];
  const convenienceFee = 100;
  const totalAmount = selectedPackage.price + convenienceFee;

  const handleProviderChange = (newProv: 'DSTV' | 'GOTV' | 'STARTIMES') => {
    setProvider(newProv);
    setSelectedPackageCode(packages[newProv][0].code);
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!smartcard.trim() || smartcard.length < 10) {
      setError('Please enter a valid 10-11 digit Smartcard / IUC number.');
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
        provider: string;
        smartcard: string;
        amount: number;
        newBalance: number;
        date: string;
        message: string;
      }>('/services/tv/purchase', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          smartcardNumber: smartcard.trim(),
          packageCode: selectedPackage.code,
          packageName: selectedPackage.name,
          amount: selectedPackage.price,
          pin: inputPin
        })
      });

      setShowConfirm(false);
      const receipt: ReceiptData = {
        title: 'Cable TV Subscription',
        service: `${provider} ${selectedPackage.name}`,
        reference: data.reference,
        amount: data.amount,
        status: 'Successful',
        date: data.date,
        recipient: data.smartcard,
        details: {
          Provider: provider,
          Package: selectedPackage.name,
          'Smartcard / IUC': data.smartcard
        }
      };

      onSuccess(receipt, data.newBalance);
    } catch (err: any) {
      throw new Error(err.message || 'TV subscription renewal failed.');
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
          <Tv className="w-4 h-4 text-purple-400" />
          <span>Cable TV Recharge</span>
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
            1. Select TV Provider
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['GOTV', 'DSTV', 'STARTIMES'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                  provider === p
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            2. Smartcard / IUC Number
          </label>
          <input
            type="text"
            value={smartcard}
            onChange={(e) => setSmartcard(e.target.value)}
            placeholder="Enter IUC number"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            3. Select Package / Bouquet
          </label>
          <div className="space-y-2">
            {currentPackages.map((pkg) => {
              const isSelected = selectedPackageCode === pkg.code;
              return (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() => setSelectedPackageCode(pkg.code)}
                  className={`w-full p-3 rounded-xl text-left border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-purple-500/10 border-purple-500 ring-1 ring-purple-500'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-bold text-white">{pkg.name}</span>
                  <span className="font-black text-purple-400 text-sm">&#8358;{pkg.price.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
          <span className="text-slate-400">Convenience fee: &#8358;{convenienceFee}</span>
          <span className="font-bold text-white">Total: &#8358;{totalAmount.toLocaleString()}</span>
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
        serviceTitle={`${provider} Subscription`}
        details={[
          { label: 'Provider', value: provider },
          { label: 'Bouquet Package', value: selectedPackage.name, isHighlight: true },
          { label: 'Smartcard / IUC', value: smartcard },
          { label: 'Package Price', value: `₦${selectedPackage.price.toLocaleString()}` },
          { label: 'Convenience Fee', value: `₦${convenienceFee.toLocaleString()}` }
        ]}
        totalAmount={totalAmount}
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
