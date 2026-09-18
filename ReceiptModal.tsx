import React from 'react';
import { X, CheckCircle2, AlertCircle, Clock, Share2, Printer, ArrowDownCircle } from 'lucide-react';
import { ReceiptData } from '../../types';

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const isSuccess = receipt.status === 'Successful';
  const isPending = receipt.status === 'Pending';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Receipt Header */}
        <div className="text-center pt-2 pb-4 border-b border-slate-800">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-black text-xl mb-2 shadow-md">
            M
          </div>
          <h2 className="text-base font-extrabold text-white">Mash DataSub</h2>
          <p className="text-[11px] text-slate-400">Official Transaction Receipt</p>
        </div>

        {/* Status & Amount */}
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2 bg-slate-800">
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Successful</span>
              </>
            ) : isPending ? (
              <>
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400">Pending</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400">{receipt.status}</span>
              </>
            )}
          </div>
          <div className="text-3xl font-black text-white tracking-tight">
            &#8358;{receipt.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">{receipt.service}</div>
        </div>

        {/* Details Table */}
        <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800/80 space-y-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Reference:</span>
            <span className="font-mono text-emerald-400 font-bold select-all text-[11px]">{receipt.reference}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Date &amp; Time:</span>
            <span className="text-slate-300 font-medium">
              {new Date(receipt.date).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {receipt.recipient && (
            <div className="flex justify-between">
              <span className="text-slate-400">Recipient:</span>
              <span className="text-white font-bold">{receipt.recipient}</span>
            </div>
          )}

          {receipt.details &&
            Object.entries(receipt.details).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-400">{k}:</span>
                <span className="text-white font-bold">{String(v)}</span>
              </div>
            ))}
        </div>

        {/* Support note */}
        <p className="text-[11px] text-center text-slate-500 mt-4">
          Need help? Contact support: 0808 1419 276
        </p>

        {/* Actions */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
