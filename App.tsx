import React, { useState, useEffect } from 'react';
import { apiRequest, getAuthToken, removeAuthToken } from './api';
import { UserProfile, ReceiptData } from './types';

// Auth Views
import { LoginView } from './LoginView';
import { SignUpView } from './SignUpView';
import { ForgotPasswordView } from './ForgotPasswordView';

// Customer Views & Layout
import { Header } from './Header';
import { BottomNav, CustomerTab } from './BottomNav';
import { HomeView } from './HomeView';
import { DataPurchaseView } from './DataPurchaseView';
import { AirtimePurchaseView } from './AirtimePurchaseView';
import { ElectricityView } from './ElectricityView';
import { TvCableView } from './TvCableView';
import { ExamPinView } from './ExamPinView';
import { AirtimeToCashView } from './AirtimeToCashView';
import { TransactionsView } from './TransactionsView';
import { WalletView } from './WalletView';
import { ProfileView } from './ProfileView';
import { FundWalletModal } from './FundWalletModal';
import { TransferMoneyModal } from './TransferMoneyModal';
import { ReceiptModal } from './ReceiptModal';
import { SecurityPinModal } from './SecurityPinModal';

// Admin View
import { AdminDashboard } from './AdminDashboard';

import { ShieldAlert, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Auth sub-view (only relevant when unauthenticated)
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot-password'>('login');

  // Customer Navigation State
  const [currentTab, setCurrentTab] = useState<CustomerTab>('home');
  const [activeService, setActiveService] = useState<
    'data' | 'airtime' | 'electricity' | 'tv' | 'exam-pin' | 'airtime-cash' | null
  >(null);

  // Modals
  const [showFundWallet, setShowFundWallet] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  // Hide/Show balance toggle
  const [hideBalance, setHideBalance] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mash_hide_balance') === 'true';
    } catch {
      return false;
    }
  });

  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mash_hide_balance', String(next));
      } catch {}
      return next;
    });
  };

  // Admin View State (Only accessible to ADMIN or OWNER)
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Helper to push browser URL history
  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  };

  // Route synchronizer supporting refresh, deep-linking, and browser back/forward
  const applyRoute = (pathname: string, user: UserProfile | null) => {
    const cleanPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';

    if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) {
      if (user) {
        if (user.role === 'ADMIN' || user.role === 'OWNER') {
          setShowAdminPanel(true);
          setActiveService(null);
        } else {
          // Normal customer entered /admin: deny & send to /
          setShowAdminPanel(false);
          window.history.replaceState(null, '', '/');
        }
      } else {
        // Unauthenticated visitor on /admin
        setShowAdminPanel(false);
      }
      return;
    }

    setShowAdminPanel(false);

    if (cleanPath === '/wallet') {
      setActiveService(null);
      setCurrentTab('wallet');
      return;
    }

    if (cleanPath === '/transactions') {
      setActiveService(null);
      setCurrentTab('transactions');
      return;
    }

    if (cleanPath === '/profile') {
      setActiveService(null);
      setCurrentTab('profile');
      return;
    }

    if (cleanPath === '/services/data' || cleanPath === '/data') {
      setActiveService('data');
      return;
    }

    if (cleanPath === '/services/airtime' || cleanPath === '/airtime') {
      setActiveService('airtime');
      return;
    }

    if (cleanPath === '/services/electricity' || cleanPath === '/electricity') {
      setActiveService('electricity');
      return;
    }

    if (cleanPath === '/services/tv' || cleanPath === '/tv') {
      setActiveService('tv');
      return;
    }

    if (cleanPath === '/services/exam-pin' || cleanPath === '/exam-pin') {
      setActiveService('exam-pin');
      return;
    }

    if (cleanPath === '/services/airtime-cash' || cleanPath === '/airtime-cash') {
      setActiveService('airtime-cash');
      return;
    }

    if (cleanPath === '/signup') {
      if (!user) setAuthView('signup');
      return;
    }

    if (cleanPath === '/forgot-password') {
      if (!user) setAuthView('forgot-password');
      return;
    }

    if (cleanPath === '/login') {
      if (!user) setAuthView('login');
      return;
    }

    // Default: home
    setActiveService(null);
    setCurrentTab('home');
  };

  // Payment Callback Notice state
  const [paymentNotice, setPaymentNotice] = useState<{
    type: 'success' | 'failed' | 'info';
    message: string;
  } | null>(null);

  // Check existing session & payment callback redirect params
  useEffect(() => {
    checkCurrentSession();

    // Check URL parameters for Paystack payment redirect
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const reference = params.get('reference');
    const amount = params.get('amount');
    const errorMsg = params.get('error') || params.get('message');

    if (paymentStatus) {
      if (paymentStatus === 'success') {
        const amtStr = amount ? `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '';
        setPaymentNotice({
          type: 'success',
          message: `Paystack payment verified successfully! ${amtStr} has been credited to your wallet.`
        });
        setCurrentTab('wallet');
        navigateTo('/wallet');
      } else if (paymentStatus === 'already_credited') {
        setPaymentNotice({
          type: 'info',
          message: `Transaction (${reference || ''}) has already been verified and credited to your wallet.`
        });
        setCurrentTab('wallet');
        navigateTo('/wallet');
      } else if (paymentStatus === 'failed') {
        setPaymentNotice({
          type: 'failed',
          message: `Paystack payment was not successful: ${errorMsg || 'Transaction unverified'}. Your wallet was NOT charged.`
        });
      } else if (paymentStatus === 'error') {
        setPaymentNotice({
          type: 'failed',
          message: errorMsg || 'Payment verification encountered an error.'
        });
      }

      // Clean up URL query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Initial route check
    applyRoute(window.location.pathname, null);

    // Browser back/forward navigation handler
    const handlePopState = () => {
      applyRoute(window.location.pathname, currentUser);
    };

    const handleAuthExpired = () => {
      setCurrentUser(null);
      setAuthView('login');
      navigateTo('/login');
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('mash_auth_expired', handleAuthExpired);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('mash_auth_expired', handleAuthExpired);
    };
  }, []);

  const checkCurrentSession = async () => {
    const token = getAuthToken();
    if (!token) {
      setLoadingInitial(false);
      applyRoute(window.location.pathname, null);
      return;
    }

    try {
      const data = await apiRequest<{ success: boolean; user: UserProfile }>('/auth/me');
      setCurrentUser(data.user);
      applyRoute(window.location.pathname, data.user);
    } catch {
      removeAuthToken();
      setCurrentUser(null);
      applyRoute(window.location.pathname, null);
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    const path = window.location.pathname.toLowerCase();
    if ((path === '/admin' || path.startsWith('/admin/')) && (user.role === 'ADMIN' || user.role === 'OWNER')) {
      setShowAdminPanel(true);
      navigateTo('/admin');
    } else {
      setShowAdminPanel(false);
      setCurrentTab('home');
      setActiveService(null);
      navigateTo('/');
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    setCurrentUser(null);
    setAuthView('login');
    setShowAdminPanel(false);
    navigateTo('/login');
  };

  const refreshUserBalance = async () => {
    try {
      const data = await apiRequest<{ success: boolean; user: UserProfile }>('/auth/me');
      setCurrentUser(data.user);
    } catch {
      //
    }
  };

  const handleServiceSuccess = (receipt: ReceiptData, newBalance: number) => {
    setActiveReceipt(receipt);
    setActiveService(null);
    if (currentUser) {
      setCurrentUser({
        ...currentUser,
        walletBalance: newBalance
      });
    }
  };

  const handleFundSuccess = (newBalance: number) => {
    if (currentUser) {
      setCurrentUser({
        ...currentUser,
        walletBalance: newBalance
      });
    }
  };

  // Initial loading screen
  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-2xl mb-4 shadow-lg shadow-emerald-500/20">
          M
        </div>
        <h1 className="text-xl font-bold tracking-tight">Mash DataSub</h1>
        <div className="flex items-center gap-2 mt-3 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Starting application...</span>
        </div>
      </div>
    );
  }

  // FIRST SCREEN — LOGIN / AUTH (Master Requirement 2)
  // Unauthenticated users see ONLY the Login screen (or Signup / Forgot Password if triggered).
  // Zero access to Dashboard, wallet balance, demo money, or admin shortcuts before login.
  if (!currentUser) {
    if (authView === 'signup') {
      return (
        <SignUpView
          onSuccess={handleLoginSuccess}
          onNavigateToLogin={() => {
            setAuthView('login');
            navigateTo('/login');
          }}
        />
      );
    }

    if (authView === 'forgot-password') {
      return (
        <ForgotPasswordView
          onNavigateToLogin={() => {
            setAuthView('login');
            navigateTo('/login');
          }}
        />
      );
    }

    return (
      <LoginView
        onSuccess={handleLoginSuccess}
        onNavigateToSignUp={() => {
          setAuthView('signup');
          navigateTo('/signup');
        }}
        onNavigateToForgotPassword={() => {
          setAuthView('forgot-password');
          navigateTo('/forgot-password');
        }}
      />
    );
  }

  // Admin Dashboard View (Only for OWNER or ADMIN)
  if (showAdminPanel && (currentUser.role === 'ADMIN' || currentUser.role === 'OWNER')) {
    return (
      <AdminDashboard
        user={currentUser}
        onExitAdmin={() => {
          setShowAdminPanel(false);
          navigateTo('/');
        }}
      />
    );
  }

  // Active Service View (e.g. Data, Airtime, etc.)
  if (activeService === 'data') {
    return (
      <>
        <DataPurchaseView
          user={currentUser}
          onBack={() => {
            setActiveService(null);
            navigateTo('/');
          }}
          onSuccess={handleServiceSuccess}
          onPromptSetPin={() => setShowPinModal(true)}
          onOpenFundWallet={() => setShowFundWallet(true)}
        />
        <FundWalletModal
          isOpen={showFundWallet}
          onClose={() => setShowFundWallet(false)}
          onSuccess={handleFundSuccess}
        />
        <SecurityPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          hasExistingPin={currentUser.hasPin}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, hasPin: true });
          }}
        />
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      </>
    );
  }

  if (activeService === 'airtime') {
    return (
      <>
        <AirtimePurchaseView
          user={currentUser}
          onBack={() => {
            setActiveService(null);
            navigateTo('/');
          }}
          onSuccess={handleServiceSuccess}
          onPromptSetPin={() => setShowPinModal(true)}
          onOpenFundWallet={() => setShowFundWallet(true)}
        />
        <FundWalletModal
          isOpen={showFundWallet}
          onClose={() => setShowFundWallet(false)}
          onSuccess={handleFundSuccess}
        />
        <SecurityPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          hasExistingPin={currentUser.hasPin}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, hasPin: true });
          }}
        />
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      </>
    );
  }

  if (activeService === 'electricity') {
    return (
      <>
        <ElectricityView
          user={currentUser}
          onBack={() => {
            setActiveService(null);
            navigateTo('/');
          }}
          onSuccess={handleServiceSuccess}
          onPromptSetPin={() => setShowPinModal(true)}
          onOpenFundWallet={() => setShowFundWallet(true)}
        />
        <FundWalletModal
          isOpen={showFundWallet}
          onClose={() => setShowFundWallet(false)}
          onSuccess={handleFundSuccess}
        />
        <SecurityPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          hasExistingPin={currentUser.hasPin}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, hasPin: true });
          }}
        />
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      </>
    );
  }

  if (activeService === 'tv') {
    return (
      <>
        <TvCableView
          user={currentUser}
          onBack={() => {
            setActiveService(null);
            navigateTo('/');
          }}
          onSuccess={handleServiceSuccess}
          onPromptSetPin={() => setShowPinModal(true)}
          onOpenFundWallet={() => setShowFundWallet(true)}
        />
        <FundWalletModal
          isOpen={showFundWallet}
          onClose={() => setShowFundWallet(false)}
          onSuccess={handleFundSuccess}
        />
        <SecurityPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          hasExistingPin={currentUser.hasPin}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, hasPin: true });
          }}
        />
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      </>
    );
  }

  if (activeService === 'exam-pin') {
    return (
      <>
        <ExamPinView
          user={currentUser}
          onBack={() => {
            setActiveService(null);
            navigateTo('/');
          }}
          onSuccess={handleServiceSuccess}
          onPromptSetPin={() => setShowPinModal(true)}
          onOpenFundWallet={() => setShowFundWallet(true)}
        />
        <FundWalletModal
          isOpen={showFundWallet}
          onClose={() => setShowFundWallet(false)}
          onSuccess={handleFundSuccess}
        />
        <SecurityPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          hasExistingPin={currentUser.hasPin}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, hasPin: true });
          }}
        />
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      </>
    );
  }

  if (activeService === 'airtime-cash') {
    return (
      <AirtimeToCashView
        user={currentUser}
        onBack={() => {
          setActiveService(null);
          navigateTo('/');
        }}
      />
    );
  }

  // MAIN CUSTOMER APP VIEW
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
      {/* Top Customer Header */}
      <Header
        user={currentUser}
        onOpenFundWallet={() => setShowFundWallet(true)}
        onOpenTransferModal={() => setShowTransferModal(true)}
        onRefreshBalance={refreshUserBalance}
        hideBalance={hideBalance}
        onToggleHideBalance={toggleHideBalance}
      />

      {/* Admin Quick Switcher (Visible strictly to authenticated ADMIN or OWNER) */}
      {(currentUser.role === 'ADMIN' || currentUser.role === 'OWNER') && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-2">
          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <span>Signed in as <strong>{currentUser.role}</strong> ({currentUser.email})</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAdminPanel(true);
                navigateTo('/admin');
              }}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors"
            >
              Open Admin Panel
            </button>
          </div>
        </div>
      )}

      {/* Payment Callback Notification Banner */}
      {paymentNotice && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-3">
          <div className={`p-3.5 rounded-2xl text-xs flex items-center justify-between gap-2.5 border ${
            paymentNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : paymentNotice.type === 'info'
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            <span className="font-semibold">{paymentNotice.message}</span>
            <button
              type="button"
              onClick={() => setPaymentNotice(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-4 pb-20 overflow-y-auto">
        {currentTab === 'home' && (
          <HomeView
            user={currentUser}
            onNavigateService={(srv) => {
              setActiveService(srv);
              navigateTo(srv === 'airtime-cash' ? '/services/airtime-cash' : `/services/${srv}`);
            }}
            onOpenFundWallet={() => setShowFundWallet(true)}
            onOpenTransferModal={() => setShowTransferModal(true)}
            onViewAllTransactions={() => {
              setCurrentTab('transactions');
              navigateTo('/transactions');
            }}
            onSelectReceipt={(rcpt) => setActiveReceipt(rcpt)}
            onPromptSetPin={() => setShowPinModal(true)}
          />
        )}

        {currentTab === 'transactions' && (
          <TransactionsView
            onSelectReceipt={(rcpt) => setActiveReceipt(rcpt)}
          />
        )}

        {currentTab === 'wallet' && (
          <WalletView
            user={currentUser}
            onOpenFundWallet={() => setShowFundWallet(true)}
            onOpenTransferModal={() => setShowTransferModal(true)}
            hideBalance={hideBalance}
            onToggleHideBalance={toggleHideBalance}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileView
            user={currentUser}
            onLogout={handleLogout}
            onOpenPinModal={() => setShowPinModal(true)}
            onUserUpdated={(updated) => setCurrentUser({ ...currentUser, ...updated })}
          />
        )}
      </main>

      {/* Persistent Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setActiveService(null);
          navigateTo(tab === 'home' ? '/' : `/${tab}`);
        }}
      />

      {/* Fund Wallet Modal */}
      <FundWalletModal
        isOpen={showFundWallet}
        onClose={() => setShowFundWallet(false)}
        onSuccess={handleFundSuccess}
        user={currentUser}
        onSelectReceipt={(rcpt) => setActiveReceipt(rcpt)}
        onPromptSetPin={() => setShowPinModal(true)}
        onOpenTransfer={() => setShowTransferModal(true)}
      />

      {/* Peer-to-Peer Transfer Modal */}
      <TransferMoneyModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        user={currentUser}
        onSuccess={handleFundSuccess}
        onSelectReceipt={(rcpt) => setActiveReceipt(rcpt)}
        onPromptSetPin={() => setShowPinModal(true)}
      />

      {/* Transaction PIN Setup / Change Modal */}
      <SecurityPinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        hasExistingPin={currentUser.hasPin}
        onSuccess={() => {
          setCurrentUser({ ...currentUser, hasPin: true });
        }}
      />

      {/* Transaction Receipt Modal */}
      <ReceiptModal
        receipt={activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />
    </div>
  );
}
