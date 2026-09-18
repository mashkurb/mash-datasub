import React, { useState } from 'react';
import { X, Lock, ShieldCheck, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../../api';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasExistingPin: boolean;
  onSuccess: () => void;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
  isOpen,
  onClose,
  hasExistingPin,
  onSuccess
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (hasExistingPin && (!currentPin || currentPin.length !== 4)) {
      setError('Please enter your current 4-digit PIN.');
      return;
    }
    if (!newPin || newPin.length !== 4) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/pin/update', {
        method: 'POST',
        body: JSON.stringify({
          currentPin: hasExistingPin ? currentPin : undefined,
          newPin
        })
      });

      setSuccess('Transaction PIN successfully updated!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to update PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {hasExistingPin ? 'Change Transaction PIN' : 'Set Up Transaction PIN'}
            </h3>
            <p className="text-xs text-slate-400">Required to authorize purchases</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {hasExistingPin && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Current 4-Digit PIN
              </label>
              <input
                type="password"
                maxLength={4}
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                placeholder="&bull;&bull;&bull;&bull;"
                className="w-full py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-center font-mono text-xl tracking-[6px]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              New 4-Digit PIN
            </label>
            <input
              type="password"
              maxLength={4}
              required
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="&bull;&bull;&bull;&bull;"
              className="w-full py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-center font-mono text-xl tracking-[6px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Confirm New PIN
            </label>
            <input
              type="password"
              maxLength={4}
              required
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="&bull;&bull;&bull;&bull;"
              className="w-full py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-center font-mono text-xl tracking-[6px]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || newPin.length !== 4 || confirmPin.length !== 4}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>Save PIN</span>
          </button>
        </form>
      </div>
    </div>
  );
};
