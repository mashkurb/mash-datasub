import React from 'react';
import { Wallet, PlusCircle, CreditCard, Building, Send, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../../types';

interface WalletViewProps {
  user: UserProfile;
  onOpenFundWallet: () => void;
  onOpenTransferModal: () => void;
  hideBalance?: boolean;
  onToggleHideBalance?: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  onOpenFundWallet,
  onOpenTransferModal,
  hideBalance = false,
  onToggleHideBalance
}) => {
  return (
    <div className="space-y-5 pb-20 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <span>Mash Wallet</span>
        </h2>
      </div>

      {/* Main Balance Display */}
      <div className="bg-gradient-to-tr from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-3xl p-6 shadow-xl space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium">
            <span>Total Wallet Balance</span>
            {onToggleHideBalance && (
              <button
                type="button"
                id="toggle-hide-balance-wallet"
                onClick={onToggleHideBalance}
                title={hideBalance ? 'Show balance' : 'Hide balance'}
                className="p-1 rounded-md text-emerald-300 hover:text-white hover:bg-emerald-500/20 transition-colors"
              >
                {hideBalance ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-1">
            {hideBalance ? (
              <span className="tracking-widest font-mono text-2xl sm:text-3xl text-slate-300">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
            ) : (
              <>&#8358;{(user.walletBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </div>
        </div>

        {/* Action Buttons: Fund Wallet & Transfer Money */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            id="wallet-fund-btn"
            onClick={onOpenFundWallet}
            className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Fund Wallet</span>
          </button>

          <button
            type="button"
            id="wallet-transfer-btn"
            onClick={onOpenTransferModal}
            className="w-full py-3.5 px-4 bg-slate-800/90 hover:bg-slate-700/90 border border-emerald-500/30 text-emerald-400 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Send className="w-5 h-5" />
            <span>Transfer Money</span>
          </button>
        </div>
      </div>

      {/* Payment Channels */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Deposit Methods</h3>
        <div className="space-y-3">
          {/* Dedicated Virtual Account Channel */}
          <div className="p-4 bg-slate-900 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Dedicated Virtual Account</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-extrabold">
                    Bank Transfer
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Automated bank transfer NUBAN funding</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenFundWallet}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-bold text-emerald-400 rounded-lg transition-colors"
            >
              View Account
            </button>
          </div>

          {/* Instant Online Checkout Channel */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Instant Online Checkout</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-extrabold">
                    Active
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Instant Card, USSD &amp; Direct Bank Transfer</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenFundWallet}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg transition-colors"
            >
              Deposit
            </button>
          </div>

          {/* Internal Wallet-to-Wallet Transfer Channel */}
          <div className="p-4 bg-slate-900 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Internal Wallet Transfer</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                    Peer-to-Peer
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Instant money transfer to any registered Mash user</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenTransferModal}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Transfer Now
            </button>
          </div>
        </div>
      </div>

      {/* Security note */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-start gap-3 text-xs text-slate-400">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Your wallet is secured with server-side atomic state and 4-digit transaction PIN protection. Funds are deducted strictly upon successful provider order dispatch.
        </p>
      </div>
    </div>
  );
};
