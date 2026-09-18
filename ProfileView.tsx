import React, { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Fingerprint,
  Share2,
  Copy,
  MessageCircle,
  PhoneCall,
  LogOut,
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  KeyRound
} from 'lucide-react';
import { UserProfile } from '../../types';
import { apiRequest } from '../../api';

interface ProfileViewProps {
  user: UserProfile;
  onLogout: () => void;
  onOpenPinModal: () => void;
  onUserUpdated: (updated: Partial<UserProfile>) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onLogout,
  onOpenPinModal,
  onUserUpdated
}) => {
  const [copied, setCopied] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(
    !!localStorage.getItem('mash_bio_token')
  );
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(user.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleBiometric = async () => {
    setBioError(null);
    if (biometricEnabled) {
      // Disable biometric on device
      localStorage.removeItem('mash_bio_token');
      localStorage.removeItem('mash_bio_email');
      setBiometricEnabled(false);
      onUserUpdated({ biometricEnabled: false });
    } else {
      // Enable biometric on device
      setBioLoading(true);
      try {
        const data = await apiRequest<{ success: boolean; biometricToken: string }>(
          '/auth/biometric/enable',
          { method: 'POST' }
        );
        localStorage.setItem('mash_bio_token', data.biometricToken);
        localStorage.setItem('mash_bio_email', user.email);
        setBiometricEnabled(true);
        onUserUpdated({ biometricEnabled: true });
      } catch (err: any) {
        setBioError(err.message || 'Could not enable biometric login on this device.');
      } finally {
        setBioLoading(false);
      }
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    setPwdLoading(true);
    try {
      await apiRequest('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      setPwdSuccess('Password changed successfully!');
      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPwdSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPwdError(err.message || 'Failed to change password. Please check your current password.');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-24 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <span>My Profile &amp; Settings</span>
        </h2>
      </div>

      {/* Account Info Card */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-sm">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 font-black text-xl flex items-center justify-center text-slate-950">
            {user.fullName[0]?.toUpperCase() || 'M'}
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white">{user.fullName}</h3>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black mt-0.5">
              {user.role}
            </span>
          </div>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <Mail className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <Phone className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{user.phone}</span>
          </div>
        </div>
      </div>

      {/* Referral Card */}
      <div className="p-5 bg-gradient-to-tr from-slate-900 to-slate-800 border border-slate-800 rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Referral Code</h4>
          </div>
          <span className="text-[11px] text-emerald-400 font-semibold">Earn on friends' recharges</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl font-mono font-black text-sm text-emerald-400">
            {user.referralCode}
          </div>
          <button
            type="button"
            onClick={handleCopyReferral}
            className="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Security & Access */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Security</h4>

        {bioError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{bioError}</span>
          </div>
        )}

        <div className="space-y-2">
          {/* Transaction PIN */}
          <button
            type="button"
            onClick={onOpenPinModal}
            className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Transaction PIN</div>
                <div className="text-[11px] text-slate-400">
                  {user.hasPin ? 'Update your 4-digit PIN' : 'Set up your 4-digit PIN (Recommended)'}
                </div>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              {user.hasPin ? 'Change' : 'Setup'} &rarr;
            </span>
          </button>

          {/* Change Password */}
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Change Password</div>
                <div className="text-[11px] text-slate-400">Update your account login password</div>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400">&rarr;</span>
          </button>

          {/* Biometric Toggle */}
          <div className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Biometric Login</div>
                <div className="text-[11px] text-slate-400">Sign in using fingerprint / Face ID on this device</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleBiometric}
              disabled={bioLoading}
              className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-1 ${
                biometricEnabled ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  biometricEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Customer Support */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Support</h4>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="https://wa.me/2348081419276?text=Hello%20Mash%20DataSub%20Customer%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl flex items-center gap-2.5 transition-colors"
          >
            <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">WhatsApp</div>
              <div className="text-[10px] text-slate-400">0808 1419 276</div>
            </div>
          </a>

          <a
            href="tel:08081419276"
            className="p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl flex items-center gap-2.5 transition-colors"
          >
            <PhoneCall className="w-5 h-5 text-slate-300 shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Phone Call</div>
              <div className="text-[10px] text-slate-400">0808 1419 276</div>
            </div>
          </a>
        </div>
      </div>

      {/* Logout */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3.5 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-white mb-3">Change Account Password</h3>

            {pwdError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pwdError}</span>
              </div>
            )}

            {pwdSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 chars"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="py-2.5 px-3 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="py-2.5 px-3 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                >
                  {pwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
