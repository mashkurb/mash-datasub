import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Wallet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  PlusCircle
} from 'lucide-react';

export interface PaymentDetailItem {
  label: string;
  value: string;
  isHighlight?: boolean;
}

export interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceTitle: string;
  details: PaymentDetailItem[];
  totalAmount: number;
  userBalance: number;
  hasPin: boolean;
  onPromptSetPin: () => void;
  onOpenFundWallet: () => void;
  onConfirmWithPin: (pin: string) => Promise<void>;
  isProcessing: boolean;
  error?: string | null;
  onClearError?: () => void;
}

export const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  isOpen,
  onClose,
  serviceTitle,
  details,
  totalAmount,
  userBalance,
  hasPin,
  onPromptSetPin,
  onOpenFundWallet,
  onConfirmWithPin,
  isProcessing,
  error,
  onClearError
}) => {
  // 'review' -> details confirmation; 'pin' -> enter transaction pin
  const [stage, setStage] = useState<'review' | 'pin'>('review');
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('review');
      setPin('');
      setLocalError(null);
      if (onClearError) onClearError();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isInsufficient = userBalance < totalAmount;
  const shortfall = Math.max(0, Math.round((totalAmount - userBalance) * 100) / 100);
  const remainingBalance = Math.max(0, Math.round((userBalance - totalAmount) * 100) / 100);

  const handleProceedToPin = () => {
    setLocalError(null);
    if (!hasPin) {
      onClose();
      onPromptSetPin();
      return;
    }
    setStage('pin');
  };

  const handleSubmitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!pin || pin.length !== 4) {
      setLocalError('Please enter your 4-digit Transaction PIN.');
      return;
    }

    try {
      await onConfirmWithPin(pin);
    } catch (err: any) {
      setLocalError(err.message || 'Transaction authorization failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ------------------------------------------------------------- */}
        {/* CASE 1: INSUFFICIENT BALANCE SCREEN                           */}
        {/* ------------------------------------------------------------- */}
        {isInsufficient ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Insufficient Balance</h3>
                <p className="text-xs text-slate-400">Wallet funding required</p>
              </div>
            </div>

            {/* Breakdown card */}
            <div className="p-4 bg-slate-950 border border-rose-500/20 rounded-2xl space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Available Balance:</span>
                <span className="font-mono text-white font-bold text-sm">
                  &#8358;{userBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Required Amount:</span>
                <span className="font-mono text-white font-bold text-sm">
                  &#8358;{totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-slate-800/80 pt-2.5 flex justify-between items-center">
                <span className="text-rose-400 font-bold">Shortfall:</span>
                <span className="font-mono text-rose-400 font-extrabold text-base">
                  &#8358;{shortfall.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Your wallet balance is not enough to complete this {serviceTitle.toLowerCase()}. Please top up your wallet
              using Paystack or direct transfer to proceed.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFundWallet();
                }}
                className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Fund Wallet</span>
              </button>
            </div>
          </div>
        ) : stage === 'review' ? (
          /* ------------------------------------------------------------- */
          /* CASE 2: PAYMENT CONFIRMATION DETAILS REVIEW                   */
          /* ------------------------------------------------------------- */
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Review Payment Details</h3>
                <p className="text-xs text-slate-400">{serviceTitle}</p>
              </div>
            </div>

            {/* Complete Itemized Details */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2.5 text-xs">
              {details.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-slate-400">
                  <span>{item.label}:</span>
                  <span className={`font-bold ${item.isHighlight ? 'text-emerald-400' : 'text-white'}`}>
                    {item.value}
                  </span>
                </div>
              ))}

              <div className="border-t border-slate-800/80 pt-2.5 flex justify-between items-center text-sm">
                <span className="text-white font-bold">Total to Pay:</span>
                <span className="font-black font-mono text-emerald-400 text-base">
                  &#8358;{totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="border-t border-slate-900 pt-2 flex justify-between items-center text-[11px] text-slate-400">
                <span>Remaining Wallet Balance:</span>
                <span className="font-mono text-slate-300">
                  &#8358;{remainingBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-enter-pin-btn"
                onClick={handleProceedToPin}
                className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <span>Confirm &amp; Enter PIN</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* ------------------------------------------------------------- */
          /* CASE 3: TRANSACTION PIN AUTHORIZATION                         */
          /* ------------------------------------------------------------- */
          <form onSubmit={handleSubmitPin} className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Enter Transaction PIN</h3>
                <p className="text-xs text-slate-400">Authorize payment of &#8358;{totalAmount.toLocaleString()}</p>
              </div>
            </div>

            {(error || localError) && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localError || error}</span>
              </div>
            )}

            {/* 4-Digit PIN Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                4-Digit Security PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="&bull;&bull;&bull;&bull;"
                  className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white text-center font-mono font-bold text-2xl tracking-[10px] placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  autoFocus
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center mt-1.5">
                Your PIN is securely validated directly on our server.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStage('review')}
                disabled={isProcessing}
                className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                id="authorize-payment-btn"
                disabled={isProcessing || pin.length !== 4}
                className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Authorize &amp; Pay</span>
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
