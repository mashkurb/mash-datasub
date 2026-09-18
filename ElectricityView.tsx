import React, { useState } from 'react';
import { Zap, ArrowLeft, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';
import { PaymentConfirmationModal } from './PaymentConfirmationModal';

interface ElectricityViewProps {
  user: UserProfile;
  onBack: () => void;
  onSuccess: (receipt: ReceiptData, newBalance: number) => void;
  onPromptSetPin: () => void;
  onOpenFundWallet?: () => void;
}

export const ElectricityView: React.FC<ElectricityViewProps> = ({
  user,
  onBack,
  onSuccess,
  onPromptSetPin,
  onOpenFundWallet
}) => {
  const discos = [
    { id: 'ikeja-electric', name: 'Ikeja Electric (IKEDC)' },
    { id: 'eko-electric', name: 'Eko Electric (EKEDC)' },
    { id: 'abuja-electric', name: 'Abuja Electricity (AEDC)' },
    { id: 'ibadan-electric', name: 'Ibadan Electric (IBEDC)' },
    { id: 'kano-electric', name: 'Kano Electricity (KEDCO)' },
    { id: 'enugu-electric', name: 'Enugu Electricity (EEDC)' },
    { id: 'port-harcourt-electric', name: 'Port Harcourt (PHED)' },
    { id: 'kaduna-electric', name: 'Kaduna Electricity (KAEDCO)' }
  ];

  const [disco, setDisco] = useState(discos[0].id);
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('2000');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convenienceFee = 100;
  const billAmount = Number(amount) || 0;
  const totalAmount = billAmount + convenienceFee;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!meterNumber.trim() || meterNumber.length < 9) {
      setError('Please enter a valid meter number.');
      return;
    }
    if (billAmount < 1000) {
      setError('Minimum electricity recharge amount is ₦1,000.');
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
      const selectedDisco = discos.find((d) => d.id === disco);
      const data = await apiRequest<{
        success: boolean;
        reference: string;
        token?: string;
        units?: string;
        meterNumber: string;
        disco: string;
        amount: number;
        newBalance: number;
        date: string;
        message: string;
      }>('/services/electricity/purchase', {
        method: 'POST',
        body: JSON.stringify({
          disco,
          meterNumber: meterNumber.trim(),
          meterType,
          amount: billAmount,
          pin: inputPin
        })
      });

      setShowConfirm(false);
      const receipt: ReceiptData = {
        title: 'Electricity Token Recharge',
        service: `${selectedDisco?.name || disco} Bill`,
        reference: data.reference,
        amount: data.amount,
        status: 'Successful',
        date: data.date,
        recipient: data.meterNumber,
        details: {
          Disco: selectedDisco?.name || disco,
          'Meter Number': data.meterNumber,
          'Meter Type': meterType.toUpperCase(),
          'Electricity Token': data.token || 'Dispatched via SMS',
          Units: data.units || 'N/A'
        }
      };

      onSuccess(receipt, data.newBalance);
    } catch (err: any) {
      throw new Error(err.message || 'Electricity recharge failed.');
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
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Electricity Bill</span>
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
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            1. Select Disco Distribution Company
          </label>
          <select
            value={disco}
            onChange={(e) => setDisco(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm font-medium focus:outline-none focus:border-emerald-500"
          >
            {discos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            2. Meter Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMeterType('prepaid')}
              className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                meterType === 'prepaid'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              Prepaid (Token)
            </button>
            <button
              type="button"
              onClick={() => setMeterType('postpaid')}
              className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                meterType === 'postpaid'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              Postpaid
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            3. Meter Number
          </label>
          <input
            type="text"
            value={meterNumber}
            onChange={(e) => setMeterNumber(e.target.value)}
            placeholder="Enter 11-13 digit meter number"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            4. Amount (&#8358;)
          </label>
          <input
            type="number"
            min={1000}
            step={500}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-lg font-bold"
          />
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
            <span>Convenience fee: &#8358;{convenienceFee}</span>
            <span>Total to pay: &#8358;{totalAmount.toLocaleString()}</span>
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
        serviceTitle={`${discos.find((d) => d.id === disco)?.name || disco} Recharge`}
        details={[
          { label: 'Electricity Provider', value: discos.find((d) => d.id === disco)?.name || disco },
          { label: 'Meter Type', value: meterType.toUpperCase() },
          { label: 'Meter Number', value: meterNumber },
          { label: 'Recharge Amount', value: `₦${billAmount.toLocaleString()}`, isHighlight: true },
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
