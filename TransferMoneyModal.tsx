import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  UserCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Lock,
  Receipt,
  Download,
  Share2
} from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';

interface TransferMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSuccess: (newBalance: number) => void;
  onSelectReceipt: (receipt: ReceiptData) => void;
  onPromptSetPin: () => void;
}

interface RecipientInfo {
  id: string;
  fullName: string;
  phone: string;
  email: string;
}

interface TransferConfig {
  enabled: boolean;
  transferEnabled: boolean;
  customerToCustomerTransferEnabled?: boolean;
  feeType: 'free' | 'flat' | 'percentage';
  transferFeeType?: 'free' | 'flat' | 'percentage';
  fixedFee: number;
  percentFee: number;
  transferCharge?: number;
  feePayer: 'SENDER' | 'RECIPIENT';
  transferFeePayer?: 'SENDER' | 'RECIPIENT';
  minTransferAmount: number;
  maxTransferAmount: number;
  dailyTransferLimit: number;
  todayTransferred?: number;
  remainingDailyLimit?: number;
}

export interface TransferMoneyContentProps {
  user: UserProfile;
  onSuccess: (newBalance: number) => void;
  onSelectReceipt: (receipt: ReceiptData) => void;
  onPromptSetPin: () => void;
  onClose?: () => void;
}

export const TransferMoneyContent: React.FC<TransferMoneyContentProps> = ({
  user,
  onSuccess,
  onSelectReceipt,
  onPromptSetPin,
  onClose
}) => {
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');

  // Input states
  const [recipientIdentifier, setRecipientIdentifier] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');

  // Verified recipient state
  const [recipient, setRecipient] = useState<RecipientInfo | null>(null);

  // Fee and configuration state
  const [config, setConfig] = useState<TransferConfig>({
    enabled: true,
    transferEnabled: true,
    customerToCustomerTransferEnabled: true,
    feeType: 'flat',
    fixedFee: 50,
    percentFee: 0,
    transferCharge: 50,
    feePayer: 'SENDER',
    minTransferAmount: 50,
    maxTransferAmount: 200000,
    dailyTransferLimit: 500000
  });
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Action states
  const [lookingUp, setLookingUp] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success result state
  const [transferResult, setTransferResult] = useState<{
    reference: string;
    amount: number;
    fee: number;
    feePayer: 'SENDER' | 'RECIPIENT';
    totalDeduction: number;
    recipientReceived: number;
    recipientName: string;
    recipientPhone: string;
    newBalance: number;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    resetModal();
    fetchTransferConfig();
  }, []);

  const resetModal = () => {
    setStep('input');
    setRecipientIdentifier('');
    setAmount('');
    setPin('');
    setRecipient(null);
    setError(null);
    setTransferResult(null);
  };

  const fetchTransferConfig = async () => {
    setLoadingConfig(true);
    try {
      const data = await apiRequest<TransferConfig>('/user/transfer/config');
      if (data) {
        setConfig(data);
      }
    } catch {
      // Use defaults if config fetch fails
    } finally {
      setLoadingConfig(false);
    }
  };

  // Calculate fees dynamically
  const numAmount = Number(amount) || 0;
  const feeType = config.transferFeeType || config.feeType || 'flat';
  let calculatedFee = 0;
  if (feeType === 'free') {
    calculatedFee = 0;
  } else if (feeType === 'percentage') {
    const pct = config.percentFee !== undefined ? config.percentFee : 0;
    calculatedFee = Math.round((numAmount * (pct / 100)) * 100) / 100;
  } else {
    calculatedFee = Math.round((config.fixedFee ?? config.transferCharge ?? 50) * 100) / 100;
  }

  const feePayer: 'SENDER' | 'RECIPIENT' = config.transferFeePayer || config.feePayer || 'SENDER';

  let totalDeduction = 0;
  let recipientReceives = 0;

  if (feePayer === 'SENDER') {
    totalDeduction = Math.round((numAmount + calculatedFee) * 100) / 100;
    recipientReceives = numAmount;
  } else {
    totalDeduction = numAmount;
    recipientReceives = Math.max(0, Math.round((numAmount - calculatedFee) * 100) / 100);
  }

  const isTransferEnabled = config.enabled !== false && config.transferEnabled !== false && config.customerToCustomerTransferEnabled !== false;

  // Step 1: Validate input and Look up recipient
  const handleLookupRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isTransferEnabled) {
      setError('Customer-to-customer transfers are temporarily disabled by the administrator.');
      return;
    }

    const cleanIdentifier = recipientIdentifier.trim();
    if (!cleanIdentifier) {
      setError('Please enter the recipient phone number, email, or username.');
      return;
    }

    if (cleanIdentifier.toLowerCase() === user.email.toLowerCase() || (user.phone && cleanIdentifier === user.phone)) {
      setError('You cannot transfer money to your own wallet account.');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid transfer amount greater than ₦0.');
      return;
    }

    const minAmount = config.minTransferAmount ?? 50;
    if (numAmount < minAmount) {
      setError(`Minimum transfer amount is ₦${minAmount.toLocaleString()}.`);
      return;
    }

    const maxAmount = config.maxTransferAmount ?? 200000;
    if (maxAmount > 0 && numAmount > maxAmount) {
      setError(`Maximum transfer amount per transaction is ₦${maxAmount.toLocaleString()}.`);
      return;
    }

    if (config.remainingDailyLimit !== undefined && config.remainingDailyLimit > 0 && numAmount > config.remainingDailyLimit) {
      setError(`Transfer amount exceeds your remaining daily limit of ₦${config.remainingDailyLimit.toLocaleString()}.`);
      return;
    }

    if (feePayer === 'RECIPIENT' && calculatedFee >= numAmount) {
      setError(`Transfer amount (₦${numAmount.toLocaleString()}) must be greater than the transfer fee (₦${calculatedFee.toLocaleString()}) when the fee is paid by recipient.`);
      return;
    }

    if (totalDeduction > user.walletBalance) {
      setError(
        `Insufficient wallet balance. Total required: ₦${totalDeduction.toLocaleString()} (${feePayer === 'SENDER' ? `Transfer: ₦${numAmount.toLocaleString()} + Fee: ₦${calculatedFee.toLocaleString()}` : `Transfer: ₦${numAmount.toLocaleString()}`}), but your current balance is ₦${user.walletBalance.toLocaleString()}.`
      );
      return;
    }

    setLookingUp(true);
    try {
      const data = await apiRequest<{ recipient: RecipientInfo }>(
        `/user/transfer/lookup-recipient?identifier=${encodeURIComponent(cleanIdentifier)}`
      );
      if (!data.recipient) {
        setError('No registered Mash DataSub account found with that phone number or email.');
        return;
      }

      setRecipient(data.recipient);
      setStep('confirm');
    } catch (err: any) {
      setError(err.message || 'Recipient phone number not found on Mash DataSub. Please check and try again.');
    } finally {
      setLookingUp(false);
    }
  };

  // Step 2: Confirm and Process Transfer with PIN
  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recipient) {
      setError('Recipient details missing. Please restart the transfer.');
      return;
    }

    if (!pin || pin.length !== 4) {
      setError('Please enter your 4-digit transaction PIN.');
      return;
    }

    setTransferring(true);
    try {
      const response = await apiRequest<any>('/user/transfer', {
        method: 'POST',
        body: JSON.stringify({
          recipientIdentifier: recipient.phone || recipient.email || recipient.id,
          recipientPhone: recipient.phone,
          amount: numAmount,
          pin: pin,
          transactionPin: pin
        })
      });

      const receipt = response.receipt || response;
      const result = {
        reference: receipt.reference || response.reference || ('TRF_' + Date.now()),
        amount: receipt.amount || response.transferAmount || numAmount,
        fee: receipt.fee !== undefined ? receipt.fee : calculatedFee,
        feePayer: (receipt.feePayer || feePayer) as 'SENDER' | 'RECIPIENT',
        totalDeduction: receipt.totalDeducted || totalDeduction,
        recipientReceived: receipt.recipientReceived !== undefined ? receipt.recipientReceived : recipientReceives,
        recipientName: receipt.recipientName || response.recipient?.fullName || recipient.fullName,
        recipientPhone: receipt.recipientPhone || response.recipient?.phone || recipient.phone,
        newBalance: receipt.newBalance !== undefined ? receipt.newBalance : response.senderNewBalance,
        timestamp: receipt.date || new Date().toISOString()
      };

      setTransferResult(result);
      if (result.newBalance !== undefined) {
        onSuccess(result.newBalance);
      }
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Transfer failed. Please check your transaction PIN and try again.');
    } finally {
      setTransferring(false);
    }
  };

  const handleViewReceipt = () => {
    if (!transferResult) return;
    const receiptData: ReceiptData = {
      title: 'Wallet Transfer Receipt',
      service: 'Transfer to ' + transferResult.recipientName,
      reference: transferResult.reference,
      amount: transferResult.amount,
      status: 'Successful',
      date: transferResult.timestamp,
      recipient: transferResult.recipientName,
      details: {
        'Recipient Account': transferResult.recipientPhone || transferResult.recipientName,
        'Transfer Amount': `₦${transferResult.amount.toLocaleString()}`,
        'Transfer Fee': `₦${transferResult.fee.toLocaleString()}`,
        'Fee Payer': transferResult.feePayer === 'SENDER' ? 'Paid by Sender' : 'Deducted from Recipient',
        'Recipient Received': `₦${transferResult.recipientReceived.toLocaleString()}`,
        'Total Deducted from Wallet': `₦${transferResult.totalDeduction.toLocaleString()}`,
        'New Wallet Balance': `₦${transferResult.newBalance.toLocaleString()}`
      }
    };
    if (onClose) onClose();
    onSelectReceipt(receiptData);
  };

  return (
    <div className="space-y-4">
      {/* Error notification banner */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* Not configured / disabled warning */}
      {!config.transferEnabled && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Wallet transfers are currently paused by the system administrator.</span>
        </div>
      )}

      {/* STEP 1: ENTER RECIPIENT & AMOUNT */}
      {step === 'input' && (
          <form onSubmit={handleLookupRecipient} className="space-y-4">
            {/* Sender Balance Pill */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-slate-400">Your Wallet Balance:</span>
              <span className="font-extrabold text-emerald-400 text-sm">
                ₦{user.walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Recipient Identifier Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Recipient Phone, Email, or Username
              </label>
              <input
                type="text"
                required
                value={recipientIdentifier}
                onChange={(e) => setRecipientIdentifier(e.target.value)}
                placeholder="e.g. 08081419276 or user@example.com"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600 font-medium"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Recipient must have an existing registered Mash DataSub account.
              </p>
            </div>

            {/* Transfer Amount Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Transfer Amount (₦)
                </label>
                {config.remainingDailyLimit !== undefined && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    Daily Limit Left: <strong className="text-emerald-400">₦{config.remainingDailyLimit.toLocaleString()}</strong>
                  </span>
                )}
              </div>
              <input
                type="number"
                min={config.minTransferAmount || 50}
                max={config.maxTransferAmount || 200000}
                step={10}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-xl font-bold font-mono focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span>Min: ₦{(config.minTransferAmount || 50).toLocaleString()}</span>
                <span>Max: ₦{(config.maxTransferAmount || 200000).toLocaleString()}</span>
              </div>
            </div>

            {/* Live Fee & Total Breakdown */}
            {numAmount > 0 && (
              <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Transfer Amount:</span>
                  <span className="font-mono text-white font-bold">₦{numAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Transfer Fee:</span>
                  <span className="font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                    {calculatedFee === 0 ? 'FREE (₦0)' : `₦${calculatedFee.toLocaleString()}`}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {feePayer === 'SENDER' ? 'Sender pays' : 'Recipient pays'}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Recipient Receives:</span>
                  <span className="font-mono text-emerald-400 font-bold">₦{recipientReceives.toLocaleString()}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold">
                  <span className="text-white">Total Deducted from You:</span>
                  <span className="font-mono text-amber-400 text-sm">₦{totalDeduction.toLocaleString()}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={lookingUp || !isTransferEnabled || numAmount <= 0}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] text-sm"
            >
              {lookingUp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Recipient...</span>
                </>
              ) : (
                <>
                  <span>Verify Recipient &amp; Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: RECIPIENT CONFIRMATION & PIN AUTHORIZATION */}
        {step === 'confirm' && recipient && (
          <form onSubmit={handleConfirmTransfer} className="space-y-4">
            {/* Recipient Card */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold uppercase tracking-wider">
                <UserCheck className="w-4 h-4" />
                <span>Verified Recipient Found</span>
              </div>
              <div>
                <div className="text-base font-extrabold text-white">{recipient.fullName}</div>
                <div className="text-xs text-slate-300 mt-0.5">{recipient.phone || recipient.email}</div>
              </div>
            </div>

            {/* Transfer Breakdown Summary */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Transfer Amount:</span>
                <span className="font-bold text-white">₦{numAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Transfer Fee:</span>
                <span className="font-bold text-emerald-400">
                  {calculatedFee === 0 ? '₦0.00 (Free)' : `₦${calculatedFee.toLocaleString()}`}
                  <span className="ml-1.5 text-[10px] text-slate-400">
                    ({feePayer === 'SENDER' ? 'Sender pays' : 'Deducted from recipient'})
                  </span>
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Recipient Gets:</span>
                <span className="font-bold text-emerald-400">₦{recipientReceives.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold">
                <span className="text-white">Total Wallet Deduction:</span>
                <span className="font-mono text-amber-400 text-sm">₦{totalDeduction.toLocaleString()}</span>
              </div>
            </div>

            {/* 4-Digit Transaction PIN Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Enter 4-Digit Transaction PIN</span>
                </span>
                {!user.hasPin && (
                  <button
                    type="button"
                    onClick={onPromptSetPin}
                    className="text-emerald-400 hover:underline normal-case font-medium text-[11px]"
                  >
                    Set PIN first &rarr;
                  </button>
                )}
              </label>
              <input
                type="password"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-center text-2xl tracking-[0.5em] font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={transferring}
                className="py-3 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={transferring || pin.length !== 4}
                className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
              >
                {transferring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Transfer</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SUCCESS RECEIPT */}
        {step === 'success' && transferResult && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-white">Transfer Successful!</h4>
              <p className="text-xs text-slate-400">
                ₦{transferResult.amount.toLocaleString()} sent instantly to {transferResult.recipientName}.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Transaction Reference:</span>
                <span className="font-mono text-emerald-400 font-bold">{transferResult.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient:</span>
                <span className="font-bold text-white">{transferResult.recipientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Sent:</span>
                <span className="font-mono text-white font-bold">₦{transferResult.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Transfer Fee:</span>
                <span className="font-mono text-slate-300">
                  ₦{transferResult.fee.toLocaleString()} ({transferResult.feePayer === 'SENDER' ? 'Paid by Sender' : 'Recipient Paid'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient Credited:</span>
                <span className="font-mono text-emerald-400 font-bold">₦{transferResult.recipientReceived.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold">
                <span className="text-slate-400">New Wallet Balance:</span>
                <span className="font-mono text-emerald-400 text-sm">
                  ₦{transferResult.newBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleViewReceipt}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-xs transition-all active:scale-[0.99]"
              >
                <Receipt className="w-4 h-4" />
                <span>View Full Receipt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                }}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export const TransferMoneyModal: React.FC<TransferMoneyModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
  onSelectReceipt,
  onPromptSetPin
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Transfer Money</h3>
            <p className="text-xs text-slate-400">Instant customer-to-customer wallet transfer</p>
          </div>
        </div>

        <TransferMoneyContent
          user={user}
          onSuccess={onSuccess}
          onSelectReceipt={onSelectReceipt}
          onPromptSetPin={onPromptSetPin}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
