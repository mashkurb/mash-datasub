import React, { useEffect, useState } from 'react';
import {
  Wifi,
  Smartphone,
  Zap,
  Tv,
  GraduationCap,
  RefreshCw,
  PlusCircle,
  MessageCircle,
  PhoneCall,
  History,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send
} from 'lucide-react';
import { UserProfile, TransactionItem, ReceiptData } from '../../types';
import { apiRequest } from '../../api';

interface HomeViewProps {
  user: UserProfile;
  onNavigateService: (service: 'data' | 'airtime' | 'electricity' | 'tv' | 'exam-pin' | 'airtime-cash') => void;
  onOpenFundWallet: () => void;
  onOpenTransferModal?: () => void;
  onViewAllTransactions: () => void;
  onSelectReceipt: (receipt: ReceiptData) => void;
  onPromptSetPin: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user,
  onNavigateService,
  onOpenFundWallet,
  onOpenTransferModal,
  onViewAllTransactions,
  onSelectReceipt,
  onPromptSetPin
}) => {
  const [recentTx, setRecentTx] = useState<TransactionItem[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [activeServices, setActiveServices] = useState<string[]>(['data', 'airtime', 'electricity', 'tv', 'exam-pin', 'airtime-cash']);

  useEffect(() => {
    fetchRecentTransactions();
    fetchActiveServices();
  }, []);

  const fetchActiveServices = async () => {
    try {
      const data = await apiRequest<{ success: boolean; services: { id: string; enabled: boolean; customerVisible: boolean }[] }>('/services');
      if (data.services && Array.isArray(data.services)) {
        setActiveServices(data.services.filter(s => s.enabled && s.customerVisible).map(s => s.id));
      }
    } catch {
      // Keep defaults if network fails
    }
  };

  const fetchRecentTransactions = async () => {
    try {
      const data = await apiRequest<{ transactions: TransactionItem[] }>('/transactions/my?limit=5');
      setRecentTx(data.transactions || []);
    } catch {
      // Ignore initial silent fetch errors
    } finally {
      setLoadingTx(false);
    }
  };

  const allServices = [
    {
      id: 'data' as const,
      label: 'Buy Data',
      subtitle: 'SME, Corp & Gifting',
      icon: Wifi,
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:border-emerald-400'
    },
    {
      id: 'airtime' as const,
      label: 'Buy Airtime',
      subtitle: 'VTU Recharge',
      icon: Smartphone,
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:border-blue-400'
    },
    {
      id: 'electricity' as const,
      label: 'Electricity',
      subtitle: 'Prepaid & Postpaid',
      icon: Zap,
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:border-amber-400'
    },
    {
      id: 'tv' as const,
      label: 'Cable TV',
      subtitle: 'DStv, GOtv, StarTimes',
      icon: Tv,
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:border-purple-400'
    },
    {
      id: 'exam-pin' as const,
      label: 'Exam PIN',
      subtitle: 'WAEC, NECO, NABTEB',
      icon: GraduationCap,
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:border-rose-400'
    },
    {
      id: 'airtime-cash' as const,
      label: 'Airtime to Cash',
      subtitle: 'Instant Bank Payout',
      icon: RefreshCw,
      color: 'bg-teal-500/10 text-teal-400 border-teal-500/30 hover:border-teal-400'
    }
  ];

  const services = allServices.filter(s => activeServices.includes(s.id));

  return (
    <div className="space-y-6 pb-6">
      {/* PIN Setup Prompt if user hasn't set one */}
      {!user.hasPin && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Protect Your Account</h4>
              <p className="text-[11px] text-amber-300/90">Set your 4-digit transaction PIN to authorize purchases.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onPromptSetPin}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
          >
            Set PIN
          </button>
        </div>
      )}

      {/* Services Grid (Touchable & Active) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Services</h3>
          <span className="text-[11px] text-emerald-400 font-semibold">24/7 Automated</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {services.map((srv) => {
            const Icon = srv.icon;
            return (
              <button
                key={srv.id}
                id={`service-btn-${srv.id}`}
                type="button"
                onClick={() => onNavigateService(srv.id)}
                className={`p-4 rounded-2xl border text-left transition-all active:scale-[0.98] flex flex-col justify-between ${srv.color} bg-slate-900 shadow-sm`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-950/60 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white">{srv.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{srv.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Direct Support & Wallet Actions Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={onOpenFundWallet}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-center gap-3 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xs text-white">Fund Wallet</div>
            <div className="text-[11px] text-slate-400">Card, virtual account &amp; USSD</div>
          </div>
        </button>

        {onOpenTransferModal && (
          <button
            type="button"
            onClick={onOpenTransferModal}
            className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20 hover:border-emerald-500/40 text-left flex items-center gap-3 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-white flex items-center gap-1.5">
                <span>Transfer Money</span>
                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded">Instant</span>
              </div>
              <div className="text-[11px] text-slate-400">Send to another Mash user</div>
            </div>
          </button>
        )}

        <a
          href="https://wa.me/2348081419276?text=Hello%20Mash%20DataSub%20Customer%20Support"
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-center gap-3 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xs text-white">Customer Support</div>
            <div className="text-[11px] text-slate-400">WhatsApp &amp; Call: 0808 1419 276</div>
          </div>
        </a>
      </div>

      {/* Recent Transactions List (Real Data Only) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Transactions</h3>
          {recentTx.length > 0 && (
            <button
              type="button"
              onClick={onViewAllTransactions}
              className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loadingTx ? (
          <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
            Loading recent transactions...
          </div>
        ) : recentTx.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 space-y-2">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">No transactions yet</p>
            <p className="text-[11px] text-slate-500">
              When you purchase data, airtime, or fund your wallet, real transaction records will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTx.map((tx) => {
              const isCredit = tx.service === 'WALLET_FUNDING';
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() =>
                    onSelectReceipt({
                      title: tx.description,
                      service: tx.service,
                      reference: tx.reference,
                      amount: tx.amount,
                      status: tx.status,
                      date: tx.createdAt,
                      recipient: tx.metadata?.recipient || tx.metadata?.phone,
                      details: tx.metadata
                    })
                  }
                  className="w-full p-3.5 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-2xl text-left flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                        tx.status === 'Successful'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : tx.status === 'Pending'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {tx.status === 'Successful' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : tx.status === 'Pending' ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                        {tx.description}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(tx.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-xs font-black ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
                      {isCredit ? '+' : '-'} &#8358;{tx.amount.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 capitalize">{tx.status}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
