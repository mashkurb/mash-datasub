import React, { useState, useEffect } from 'react';
import { History, Search, Filter, ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { apiRequest } from '../../api';
import { TransactionItem, ReceiptData } from '../../types';

interface TransactionsViewProps {
  onSelectReceipt: (receipt: ReceiptData) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ onSelectReceipt }) => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ transactions: TransactionItem[] }>('/transactions/my?limit=50');
      setTransactions(data.transactions || []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.reference.toLowerCase().includes(search.toLowerCase()) ||
      tx.description.toLowerCase().includes(search.toLowerCase()) ||
      (tx.metadata?.recipient && tx.metadata.recipient.includes(search));

    const matchesService = serviceFilter === 'ALL' || tx.service === serviceFilter;
    const matchesStatus = statusFilter === 'ALL' || tx.status === statusFilter;

    return matchesSearch && matchesService && matchesStatus;
  });

  return (
    <div className="space-y-4 pb-20 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-400" />
          <span>Transaction History</span>
        </h2>
        <button
          type="button"
          onClick={fetchTransactions}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Search & Filter bar */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, recipient phone, or service..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs"
          >
            <option value="ALL">All Services</option>
            <option value="DATA">Data</option>
            <option value="AIRTIME">Airtime</option>
            <option value="ELECTRICITY">Electricity</option>
            <option value="TV">Cable TV</option>
            <option value="EXAM_PIN">Exam PIN</option>
            <option value="WALLET_FUNDING">Wallet Funding</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="Successful">Successful</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
            <option value="Reversed">Reversed</option>
          </select>
        </div>
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
          Loading transaction records...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 space-y-2">
          <History className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-300">No matching transactions</p>
          <p className="text-[11px] text-slate-500">
            Real records will be listed here immediately when you conduct transactions.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => {
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
                className="w-full p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-left flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      tx.status === 'Successful'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : tx.status === 'Pending'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {isCredit ? (
                      <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                      {tx.description}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                      <span>{tx.reference}</span>
                      <span>&bull;</span>
                      <span>
                        {new Date(tx.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-xs font-black ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
                    {isCredit ? '+' : '-'} &#8358;{tx.amount.toLocaleString()}
                  </div>
                  <div
                    className={`text-[10px] font-bold capitalize ${
                      tx.status === 'Successful'
                        ? 'text-emerald-400'
                        : tx.status === 'Pending'
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {tx.status}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
