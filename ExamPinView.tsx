import React, { useState } from 'react';
import { GraduationCap, ArrowLeft, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';
import { PaymentConfirmationModal } from './PaymentConfirmationModal';

interface ExamPinViewProps {
  user: UserProfile;
  onBack: () => void;
  onSuccess: (receipt: ReceiptData, newBalance: number) => void;
  onPromptSetPin: () => void;
  onOpenFundWallet?: () => void;
}

export const ExamPinView: React.FC<ExamPinViewProps> = ({
  user,
  onBack,
  onSuccess,
  onPromptSetPin,
  onOpenFundWallet
}) => {
  const [examType, setExamType] = useState<'WAEC' | 'NECO' | 'NABTEB'>('WAEC');
  const [quantity, setQuantity] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prices: Record<'WAEC' | 'NECO' | 'NABTEB', number> = {
    WAEC: 3800,
    NECO: 1500,
    NABTEB: 1600
  };

  const unitPrice = prices[examType];
  const totalAmount = unitPrice * quantity;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
        amount: number;
        newBalance: number;
        date: string;
        message: string;
      }>('/services/exam-pin/purchase', {
        method: 'POST',
        body: JSON.stringify({
          examType,
          quantity,
          pin: inputPin
        })
      });

      setShowConfirm(false);
      const receipt: ReceiptData = {
        title: 'Exam PIN Purchase',
        service: `${quantity}x ${examType} Result Checker PIN`,
        reference: data.reference,
        amount: data.amount,
        status: 'Successful',
        date: data.date,
        details: {
          'Exam Body': examType,
          Quantity: quantity,
          'Unit Price': `₦${unitPrice.toLocaleString()}`
        }
      };

      onSuccess(receipt, data.newBalance);
    } catch (err: any) {
      throw new Error(err.message || 'Exam PIN purchase failed.');
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
          <GraduationCap className="w-4 h-4 text-blue-400" />
          <span>Exam PINs</span>
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
            1. Select Examination Body
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['WAEC', 'NECO', 'NABTEB'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setExamType(type)}
                className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                  examType === type
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div>{type}</div>
                <div className="text-[11px] font-normal mt-0.5 opacity-90">&#8358;{prices[type].toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            2. Quantity
          </label>
          <div className="flex items-center gap-3">
            {[1, 2, 3, 5, 10].map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setQuantity(qty)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  quantity === qty
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                {qty}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Total Price</div>
            <div className="text-xl font-black text-emerald-400">&#8358;{totalAmount.toLocaleString()}</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            {quantity}x {examType} Result Checker
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
        serviceTitle={`${examType} Result Checker`}
        details={[
          { label: 'Exam Body', value: examType },
          { label: 'Quantity', value: `${quantity} PIN${quantity > 1 ? 's' : ''}` },
          { label: 'Unit Price', value: `₦${unitPrice.toLocaleString()}` },
          { label: 'Total Cost', value: `₦${totalAmount.toLocaleString()}`, isHighlight: true }
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
