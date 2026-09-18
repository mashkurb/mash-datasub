import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
  Lock,
  Unlock,
  Shield,
  PlusCircle,
  MinusCircle,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Phone,
  Mail,
  CreditCard,
  RefreshCw,
  Eye,
  Copy,
  Check,
  FileText,
  Key
} from 'lucide-react';
import { apiRequest } from '../../api';

interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'CUSTOMER' | 'ADMIN' | 'OWNER';
  walletBalance: number;
  isVerified: boolean;
  status?: 'ACTIVE' | 'SUSPENDED';
  hasPin?: boolean;
  referralCode?: string;
  referredBy?: string;
  createdAt: string;
  updatedAt?: string;
}

interface TransactionRecord {
  id: string;
  reference: string;
  userId: string;
  userEmail: string;
  userName?: string;
  service: string;
  description: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  status: 'Successful' | 'Pending' | 'Failed';
  createdAt: string;
  metadata?: any;
}

interface UserDetailStats {
  transactionCount: number;
  totalSpent: number;
  totalFunded: number;
}

export const UsersManagementTab: React.FC = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'CUSTOMER' | 'ADMIN_OWNER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'FUNDED' | 'ZERO'>('ALL');
  const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);

  // Detail Modal state
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [detailStats, setDetailStats] = useState<UserDetailStats | null>(null);
  const [userTransactions, setUserTransactions] = useState<TransactionRecord[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Balance adjustment modal state
  const [adjustingUser, setAdjustingUser] = useState<UserRecord | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // UI notifications
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const data = await apiRequest<any>('/admin/users');
      const list: UserRecord[] = Array.isArray(data) ? data : (data.users || []);
      setUsers(list);

      // If a user was selected in detail view, update their state too
      if (selectedUser) {
        const refreshed = list.find((u) => u.id === selectedUser.id);
        if (refreshed) setSelectedUser(refreshed);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleOpenUserDetail = async (user: UserRecord) => {
    setSelectedUser(user);
    setLoadingTransactions(true);
    setUserTransactions([]);
    setDetailStats(null);

    try {
      const res = await apiRequest<any>(`/admin/users/${user.id}`);
      if (res.user) {
        setSelectedUser(res.user);
        if (res.user.stats) {
          setDetailStats(res.user.stats);
        }
      }
      if (res.transactions) {
        setUserTransactions(res.transactions);
      }
    } catch (err: any) {
      console.error('Failed to load user details:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleToggleStatus = async (user: UserRecord) => {
    const newStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setStatusTogglingId(user.id);
    setError(null);

    try {
      await apiRequest(`/admin/users/${user.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });

      setMessage(`Customer ${user.fullName || user.email} is now ${newStatus}.`);
      setTimeout(() => setMessage(null), 3000);
      loadUsers(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingUser) return;
    const amt = Number(adjustAmount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }

    if (!adjustReason.trim()) {
      setError('A reason is required for administrative audit compliance.');
      return;
    }

    setAdjustLoading(true);
    setError(null);
    try {
      const res = await apiRequest<any>('/admin/users/wallet-adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: adjustingUser.id,
          amount: amt,
          action: adjustType.toUpperCase(),
          reason: adjustReason.trim()
        })
      });

      setMessage(res.message || `Wallet for ${adjustingUser.fullName} updated successfully!`);
      const updatedUserId = adjustingUser.id;
      setAdjustingUser(null);
      setAdjustAmount('');
      setAdjustReason('');
      setTimeout(() => setMessage(null), 3500);

      await loadUsers(true);

      // Refresh transaction list if detail modal is open for this user
      if (selectedUser && selectedUser.id === updatedUserId) {
        handleOpenUserDetail({ ...selectedUser, walletBalance: res.newBalance });
      }
    } catch (err: any) {
      setError(err.message || 'Balance adjustment failed.');
    } finally {
      setAdjustLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  // Calculations for summary banner
  const totalCustomers = users.filter((u) => u.role === 'CUSTOMER').length;
  const activeCustomers = users.filter((u) => u.role === 'CUSTOMER' && u.status !== 'SUSPENDED').length;
  const suspendedCustomers = users.filter((u) => u.status === 'SUSPENDED').length;
  const totalLiabilities = users.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q)) ||
      (u.referralCode && u.referralCode.toLowerCase().includes(q));

    const matchesRole =
      roleFilter === 'ALL' ||
      (roleFilter === 'CUSTOMER' && u.role === 'CUSTOMER') ||
      (roleFilter === 'ADMIN_OWNER' && (u.role === 'ADMIN' || u.role === 'OWNER'));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.status !== 'SUSPENDED') ||
      (statusFilter === 'SUSPENDED' && u.status === 'SUSPENDED');

    const matchesBalance =
      balanceFilter === 'ALL' ||
      (balanceFilter === 'FUNDED' && (u.walletBalance || 0) > 0) ||
      (balanceFilter === 'ZERO' && (!u.walletBalance || u.walletBalance <= 0));

    return matchesSearch && matchesRole && matchesStatus && matchesBalance;
  });

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        <span>Loading registered customer accounts &amp; live wallets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-white">
      {/* Toast Notifications */}
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-2 shadow-lg shadow-red-500/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1 font-medium">
            <span>Customers</span>
            <Users className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">{totalCustomers}</div>
          <div className="text-[10px] text-emerald-400 mt-1 font-semibold">{activeCustomers} Active Accounts</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1 font-medium">
            <span>Wallet Liabilities</span>
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            &#8358;{totalLiabilities.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">Total Customer Balances</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1 font-medium">
            <span>Active Customers</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">{activeCustomers}</div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">Ready for transactions</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1 font-medium">
            <span>Suspended</span>
            <Lock className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-black text-rose-400 font-mono">{suspendedCustomers}</div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">Restricted access</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, email, phone, or referral code..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => loadUsers(true)}
            disabled={refreshing}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
          <span className="text-slate-500 font-medium">Role:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                roleFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('CUSTOMER')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                roleFilter === 'CUSTOMER' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Customers
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('ADMIN_OWNER')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                roleFilter === 'ADMIN_OWNER' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Admins/Owner
            </button>
          </div>

          <span className="text-slate-500 font-medium ml-2">Status:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('SUSPENDED')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'SUSPENDED' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Suspended
            </button>
          </div>

          <span className="text-slate-500 font-medium ml-2">Balance:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setBalanceFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                balanceFilter === 'ALL' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setBalanceFilter('FUNDED')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                balanceFilter === 'FUNDED' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Funded (&gt; &#8358;0)
            </button>
            <button
              type="button"
              onClick={() => setBalanceFilter('ZERO')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                balanceFilter === 'ZERO' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Zero (&#8358;0.00)
            </button>
          </div>

          <span className="text-slate-400 font-bold ml-auto">
            {filteredUsers.length} of {users.length} Users
          </span>
        </div>
      </div>

      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <Users className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No customers match your criteria.</p>
          <p className="text-xs text-slate-500">Try clearing your filters or search keywords.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => {
            const initials = (u.fullName || u.email || 'CU')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            const isOwner = u.role === 'OWNER';
            const isSuspended = u.status === 'SUSPENDED';

            return (
              <div
                key={u.id}
                className="p-4 bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl transition-all text-xs space-y-3 shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Customer Initials Avatar */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isOwner
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : u.role === 'ADMIN'
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                          : 'bg-slate-800 border-slate-700 text-emerald-400'
                      }`}
                    >
                      {initials}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">{u.fullName || 'Registered User'}</span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            isOwner
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : u.role === 'ADMIN'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            isSuspended
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                        </span>

                        {u.isVerified && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] flex items-center gap-1 font-semibold">
                            <Check className="w-2.5 h-2.5" />
                            <span>Verified</span>
                          </span>
                        )}

                        {u.hasPin && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] flex items-center gap-1">
                            <Key className="w-2.5 h-2.5 text-amber-400" />
                            <span>PIN Set</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span>{u.email}</span>
                        </span>
                        {u.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{u.phone}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-slate-500">
                          <Calendar className="w-3 h-3" />
                          <span>Joined {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Wallet Balance Display */}
                  <div className="text-right font-mono shrink-0">
                    <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Wallet Balance</span>
                    <span className="text-emerald-400 font-extrabold text-base sm:text-lg">
                      &#8358;{(u.walletBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2">
                    {u.referralCode && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                        Ref: <strong className="text-slate-200">{u.referralCode}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenUserDetail(u)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition-colors border border-slate-700/60"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>History &amp; Details</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAdjustingUser(u);
                        setAdjustType('credit');
                        setAdjustAmount('');
                        setAdjustReason('');
                      }}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition-colors border border-emerald-500/30"
                    >
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Adjust Wallet</span>
                    </button>

                    {!isOwner && (
                      <button
                        type="button"
                        disabled={statusTogglingId === u.id}
                        onClick={() => handleToggleStatus(u)}
                        className={`px-3 py-1.5 font-bold text-[11px] rounded-xl flex items-center gap-1.5 transition-colors border ${
                          isSuspended
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {statusTogglingId === u.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isSuspended ? (
                          <Unlock className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        <span>{isSuspended ? 'Activate' : 'Suspend'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Detail & Transaction History Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white max-h-[90vh] flex flex-col">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-start gap-3 pb-4 border-b border-slate-800 pr-10">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 font-bold text-lg shrink-0">
                {(selectedUser.fullName || selectedUser.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{selectedUser.fullName || 'Customer Profile'}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedUser.role}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      selectedUser.status === 'SUSPENDED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {selectedUser.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-x-3">
                  <span>{selectedUser.email}</span>
                  {selectedUser.phone && <span>&bull; {selectedUser.phone}</span>}
                </div>
              </div>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 font-medium block">Current Balance</span>
                <span className="text-base font-black text-emerald-400 font-mono">
                  &#8358;{(selectedUser.walletBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 font-medium block">Total Funded</span>
                <span className="text-base font-black text-blue-400 font-mono">
                  &#8358;{(detailStats?.totalFunded || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 font-medium block">Total Purchases</span>
                <span className="text-base font-black text-purple-400 font-mono">
                  &#8358;{(detailStats?.totalSpent || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Quick Actions inside detail view */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Transaction Records ({userTransactions.length})</span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setAdjustingUser(selectedUser);
                  setAdjustType('credit');
                  setAdjustAmount('');
                  setAdjustReason('');
                }}
                className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <DollarSign className="w-3 h-3" />
                <span>Adjust Balance</span>
              </button>
            </div>

            {/* Transaction Records List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
              {loadingTransactions ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <span>Loading customer transaction history...</span>
                </div>
              ) : userTransactions.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-2xl space-y-1 text-xs">
                  <CreditCard className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                  <p className="font-semibold text-slate-300">No transactions recorded yet.</p>
                  <p className="text-slate-500 text-[11px]">
                    This customer currently has a starting balance of &#8358;0.00 until their first wallet funding or purchase.
                  </p>
                </div>
              ) : (
                userTransactions.map((tx) => {
                  const isCredit = tx.service === 'WALLET_FUNDING' || (tx.amount > 0 && tx.service === 'MANUAL_ADJUSTMENT');
                  return (
                    <div
                      key={tx.id || tx.reference}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isCredit
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {tx.service.replace('_', ' ')}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              tx.status === 'Successful'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : tx.status === 'Pending'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </div>

                        <span
                          className={`font-mono font-bold text-xs ${
                            isCredit ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          {isCredit ? '+' : '-'} &#8358;{Math.abs(tx.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300">{tx.description}</p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">
                        <span className="flex items-center gap-1">
                          <span>Ref: {tx.reference}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(tx.reference)}
                            className="hover:text-slate-300 ml-1"
                            title="Copy Reference"
                          >
                            {copiedRef === tx.reference ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </span>
                        <span>{new Date(tx.createdAt).toLocaleString('en-GB')}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjust Wallet Balance Modal */}
      {adjustingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white">
            <button
              type="button"
              onClick={() => setAdjustingUser(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Adjust Customer Wallet</h3>
                <p className="text-[11px] text-slate-400">{adjustingUser.fullName || adjustingUser.email}</p>
              </div>
            </div>

            {/* Current Balance Display */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl mb-4 text-xs flex justify-between items-center">
              <span className="text-slate-400 font-medium">Current Balance:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                &#8358;{(adjustingUser.walletBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <form onSubmit={handleAdjustBalance} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('credit')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      adjustType === 'credit'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Credit (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType('debit')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      adjustType === 'debit'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    <span>Debit (-)</span>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Amount (&#8358;)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
                />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAdjustAmount(amt.toString())}
                      className="py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg"
                    >
                      +&#8358;{amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Audit Reason / Memo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Manual bank deposit resolution"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Preview calculation */}
              {Number(adjustAmount) > 0 && (
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] flex justify-between items-center text-slate-300 font-mono">
                  <span>Resulting Balance:</span>
                  <span className="font-bold text-emerald-400">
                    &#8358;
                    {Math.max(
                      0,
                      (adjustingUser.walletBalance || 0) +
                        (adjustType === 'credit' ? Number(adjustAmount) : -Number(adjustAmount))
                    ).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={adjustLoading || !adjustAmount || !adjustReason}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-colors"
              >
                {adjustLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Adjustment...</span>
                  </>
                ) : (
                  <span>Confirm {adjustType === 'credit' ? 'Credit' : 'Debit'}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
