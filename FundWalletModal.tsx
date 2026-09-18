import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Building2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Send,
  PlusCircle,
  ExternalLink,
  Lock,
  Wallet
} from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, ReceiptData } from '../../types';
import { TransferMoneyContent } from './TransferMoneyModal';

interface DedicatedAccount {
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  provider?: string;
  status?: string;
  supported?: boolean;
  message?: string;
}

interface GatewayConfig {
  activeProvider: string;
  activeProviderName: string;
  backupProviderName?: string;
  virtualAccountsEnabled: boolean;
  capabilities: {
    supportsDedicatedVirtualAccounts: boolean;
    supportsDynamicVirtualAccounts: boolean;
    supportsCheckout: boolean;
    supportsBankTransfer: boolean;
  };
}

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
  onOpenTransfer?: () => void;
  user?: UserProfile;
  onSelectReceipt?: (receipt: ReceiptData) => void;
  onPromptSetPin?: () => void;
  initialTab?: 'fund' | 'transfer';
}

export const FundWalletModal: React.FC<FundWalletModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenTransfer,
  user,
  onSelectReceipt,
  onPromptSetPin,
  initialTab = 'fund'
}) => {
  const [activeTab, setActiveTab] = useState<'fund' | 'transfer'>(initialTab);
  const [method, setMethod] = useState<'dva' | 'checkout'>('dva');
  const [amount, setAmount] = useState('2000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Gateway Configuration from backend (no hardcoding!)
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);

  // Dedicated Virtual Account state
  const [dva, setDva] = useState<DedicatedAccount | null>(null);
  const [loadingDva, setLoadingDva] = useState(false);

  // Instant Checkout state
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [currentReference, setCurrentReference] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError(null);
      setVerifySuccess(null);
      setCheckoutUrl(null);
      setCurrentReference(null);
      loadGatewayConfig();
      loadDedicatedAccount();
    }
  }, [isOpen, initialTab]);

  const loadGatewayConfig = async () => {
    try {
      const data = await apiRequest<{ success: boolean; config: GatewayConfig }>('/payments/config');
      if (data?.config) {
        setGatewayConfig(data.config);
        // If virtual accounts are not enabled on backend, automatically default to checkout
        if (!data.config.virtualAccountsEnabled || !data.config.capabilities?.supportsDedicatedVirtualAccounts) {
          setMethod('checkout');
        }
      }
    } catch {
      // Non-blocking fallback
    }
  };

  const loadDedicatedAccount = async () => {
    setLoadingDva(true);
    try {
      const data = await apiRequest<DedicatedAccount>('/wallet/account-number');
      setDva(data);
    } catch (err: any) {
      setDva({
        supported: false,
        message: 'Dedicated account number is currently unavailable. You can fund your wallet using the available payment methods.'
      });
    } finally {
      setLoadingDva(false);
    }
  };

  if (!isOpen) return null;

  const quickAmounts = [1000, 2000, 5000, 10000, 20000];

  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Unified Checkout Initialization (Active provider delegated entirely on server)
  const handleInitializeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifySuccess(null);

    const val = Number(amount);
    if (!val || val < 100) {
      setError('Minimum wallet funding amount is ₦100.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{
        success: boolean;
        reference: string;
        provider: string;
        authorizationUrl: string;
        checkoutUrl: string;
        accessCode?: string;
        publicKey?: string;
        message?: string;
      }>('/wallet/fund/initialize', {
        method: 'POST',
        body: JSON.stringify({ amount: val })
      });

      const url = data.checkoutUrl || data.authorizationUrl;
      setCurrentReference(data.reference);
      setCurrentProvider(data.provider);
      setCheckoutUrl(url);

      // Prefer in-app Paystack Inline popup if supported by provider
      const win = window as any;
      if (data.provider === 'PAYSTACK' && win.PaystackPop && (data.accessCode || data.publicKey)) {
        try {
          const handler = win.PaystackPop.setup({
            key: data.publicKey,
            access_code: data.accessCode,
            reference: data.reference,
            email: user?.email,
            amount: Math.round(val * 100),
            currency: 'NGN',
            callback: (response: any) => {
              const verifiedRef = response?.reference || data.reference;
              handleVerifyPayment(verifiedRef, data.provider);
            },
            onClose: () => {
              // Popup closed: user can still verify or re-open
            }
          });
          handler.openIframe();
          return;
        } catch (inlineErr) {
          console.warn('Paystack inline popup fallback to redirect URL:', inlineErr);
        }
      }

      // Fallback: Open secure provider checkout in new tab
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to initiate payment with the active payment provider.');
    } finally {
      setLoading(false);
    }
  };

  // Unified Server-Side Verification (Idempotent and atomic balance credit)
  const handleVerifyPayment = async (overrideRef?: string, overrideProvider?: string) => {
    const refToVerify = overrideRef || currentReference;
    if (!refToVerify) return;
    const provToVerify = overrideProvider || currentProvider;

    setVerifying(true);
    setError(null);
    try {
      const data = await apiRequest<{
        success: boolean;
        balance?: number;
        amount: number;
        provider: string;
        message: string;
      }>('/wallet/fund/verify', {
        method: 'POST',
        body: JSON.stringify({ reference: refToVerify, provider: provToVerify })
      });

      setVerifySuccess(`Payment verified! ₦${data.amount.toLocaleString()} has been credited to your wallet.`);
      setTimeout(() => {
        if (data.balance !== undefined) {
          onSuccess(data.balance);
        } else {
          onSuccess(0);
        }
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Payment not yet confirmed by the provider. Please finish checkout or retry in a few moments.');
    } finally {
      setVerifying(false);
    }
  };

  const isDvaAvailable = gatewayConfig?.virtualAccountsEnabled !== false &&
                        gatewayConfig?.capabilities?.supportsDedicatedVirtualAccounts !== false &&
                        dva?.supported !== false &&
                        Boolean(dva?.accountNumber);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            {activeTab === 'fund' ? (
              <Building2 className="w-5 h-5" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {activeTab === 'fund' ? 'Fund Mash Wallet' : 'Transfer Money'}
            </h3>
            <p className="text-xs text-slate-400">
              {activeTab === 'fund'
                ? `Automated bank transfer & secure online checkout`
                : 'Instant peer-to-peer wallet transfer'}
            </p>
          </div>
        </div>

        {/* Top Area Switcher: Fund Wallet vs Transfer Money */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('fund')}
            className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 ${
              activeTab === 'fund'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Fund Wallet</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (user) {
                setActiveTab('transfer');
              } else if (onOpenTransfer) {
                onClose();
                onOpenTransfer();
              }
            }}
            className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'transfer'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transfer Money</span>
          </button>
        </div>

        {activeTab === 'transfer' && user ? (
          <TransferMoneyContent
            user={user}
            onSuccess={onSuccess}
            onSelectReceipt={onSelectReceipt || (() => {})}
            onPromptSetPin={onPromptSetPin || (() => {})}
            onClose={onClose}
          />
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{verifySuccess}</span>
              </div>
            )}

            {/* Method selector */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <button
                type="button"
                id="fund-method-dva-btn"
                onClick={() => setMethod('dva')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-0.5 ${
                  method === 'dva'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-slate-800/40 border-slate-700 text-slate-400'
                }`}
              >
                <span>Virtual Account</span>
                <span className="text-[10px] font-normal text-emerald-300">Bank Transfer</span>
              </button>

              <button
                type="button"
                id="fund-method-checkout-btn"
                onClick={() => setMethod('checkout')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-0.5 ${
                  method === 'checkout'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-slate-800/40 border-slate-700 text-slate-400'
                }`}
              >
                <span>Instant Checkout</span>
                <span className="text-[10px] font-normal text-slate-400">Card / USSD / Bank</span>
              </button>
            </div>

            {/* METHOD 1: DEDICATED VIRTUAL ACCOUNT */}
            {method === 'dva' && (
              <div className="space-y-4">
                {loadingDva ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
                    <span className="text-xs">Retrieving your dedicated account...</span>
                  </div>
                ) : isDvaAvailable ? (
                  <div className="space-y-4">
                    <div className="p-5 bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-500/30 rounded-2xl shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 opacity-10">
                        <Building2 className="w-24 h-24 text-emerald-400" />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                        <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">
                          Automated Bank Deposit
                        </span>
                        <button
                          type="button"
                          onClick={loadDedicatedAccount}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                          title="Refresh"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Refresh</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] text-slate-400 uppercase font-medium">Bank Name</div>
                          <div className="text-sm font-bold text-white">{dva?.bankName || 'Partner Bank'}</div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 uppercase font-medium">Account Number</div>
                          <div className="flex items-center justify-between mt-1 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                            <span className="font-mono text-xl font-black text-emerald-400 tracking-wider">
                              {dva?.accountNumber}
                            </span>
                            <button
                              type="button"
                              id="copy-account-btn"
                              onClick={() => dva?.accountNumber && handleCopyAccount(dva.accountNumber)}
                              className="py-1 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 uppercase font-medium">Account Name</div>
                          <div className="text-xs font-semibold text-slate-200">{dva?.accountName || user?.fullName}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1">
                      <div className="font-bold text-slate-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Instant Automated Funding</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Transfer any amount from your bank mobile app or USSD to this account number. Your Mash DataSub wallet will be credited automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* GRACEFUL FALLBACK WHEN PROVIDER DOES NOT SUPPORT OR HAS NOT ISSUED DVA */
                  <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-2xl text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Dedicated Account Unavailable</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        {dva?.message || 'Dedicated account number is currently unavailable. You can fund your wallet using the available payment methods.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMethod('checkout')}
                      className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Use Instant Checkout Instead</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* METHOD 2: INSTANT ONLINE CHECKOUT */}
            {method === 'checkout' && (
              <div className="space-y-4">
                {!checkoutUrl ? (
                  <form onSubmit={handleInitializeCheckout} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Amount to Fund (₦)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₦</span>
                        <input
                          type="number"
                          id="fund-amount-input"
                          min="100"
                          step="100"
                          required
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                          placeholder="2,000"
                          className="w-full bg-slate-950 border border-slate-700 rounded-2xl pl-8 pr-4 py-3 text-white font-bold text-base focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Quick amount pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {quickAmounts.map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAmount(val.toString())}
                          className={`py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                            amount === val.toString()
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-white'
                          }`}
                        >
                          ₦{val.toLocaleString()}
                        </button>
                      ))}
                    </div>

                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Secure Server-Side Gateway</span>
                      </div>
                      <span className="text-[10px] font-black text-emerald-400 uppercase">
                        {gatewayConfig?.activeProviderName || 'Active Provider'}
                      </span>
                    </div>

                    <button
                      type="submit"
                      id="fund-proceed-btn"
                      disabled={loading || !amount || Number(amount) < 100}
                      className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Connecting Secure Gateway...</span>
                        </>
                      ) : (
                        <>
                          <span>Proceed to Payment</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Active checkout pending state */
                  <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-[11px] text-slate-400">Payment Reference</div>
                        <div className="font-mono text-xs font-bold text-white">{currentReference}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Amount</div>
                        <div className="text-sm font-black text-emerald-400">₦{Number(amount).toLocaleString()}</div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300">
                      Payment checkout opened in a new tab. Please complete your transaction on the secure checkout page, then verify below.
                    </p>

                    <div className="space-y-2">
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-700"
                      >
                        <ExternalLink className="w-4 h-4 text-emerald-400" />
                        <span>Re-open Checkout Page</span>
                      </a>

                      <button
                        type="button"
                        id="verify-payment-btn"
                        onClick={handleVerifyPayment}
                        disabled={verifying}
                        className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Verifying with Provider...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>I Have Completed Payment (Verify)</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutUrl(null);
                          setCurrentReference(null);
                        }}
                        className="w-full py-2 text-center text-xs text-slate-400 hover:text-white"
                      >
                        Cancel or Change Amount
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
