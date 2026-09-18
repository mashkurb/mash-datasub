import React from 'react';
import { Wallet, PlusCircle, Send, MessageCircle, PhoneCall, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '../../types';

interface HeaderProps {
  user: UserProfile;
  onOpenFundWallet: () => void;
  onOpenTransferModal?: () => void;
  onRefreshBalance: () => void;
  hideBalance?: boolean;
  onToggleHideBalance?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenFundWallet,
  onOpenTransferModal,
  hideBalance = false,
  onToggleHideBalance
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-white text-lg shadow-sm">
            M
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white leading-tight">Mash DataSub</h1>
            <p className="text-[11px] text-slate-400 font-medium">Hello, {user.fullName.split(' ')[0]}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <a
            href="https://wa.me/2348081419276?text=Hello%20Mash%20DataSub%20Support"
            target="_blank"
            rel="noopener noreferrer"
            title="WhatsApp Support: 0808 1419 276"
            className="w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
          </a>
          <a
            href="tel:08081419276"
            title="Call Support: 0808 1419 276"
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
          >
            <PhoneCall className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Wallet Card */}
      <div className="max-w-3xl mx-auto px-4 pb-3">
        <div className="bg-gradient-to-r from-emerald-900/60 via-slate-800/80 to-slate-900 border border-emerald-500/20 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                <span>Available Wallet Balance</span>
              </span>
              {onToggleHideBalance && (
                <button
                  type="button"
                  id="toggle-hide-balance-header"
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
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {hideBalance ? (
                <span className="tracking-widest font-mono text-xl sm:text-2xl text-slate-300">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
              ) : (
                <>&#8358;{(user.walletBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="fund-wallet-header-button"
              type="button"
              onClick={onOpenFundWallet}
              className="px-3.5 py-2 sm:px-4 sm:py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Fund</span>
            </button>
            {onOpenTransferModal && (
              <button
                id="transfer-money-header-button"
                type="button"
                onClick={onOpenTransferModal}
                className="px-3 py-2 sm:px-3.5 sm:py-2.5 bg-slate-800/90 hover:bg-slate-700/90 border border-emerald-500/30 text-emerald-400 font-bold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
