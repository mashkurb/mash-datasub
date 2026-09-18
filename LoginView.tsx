import React, { useState, useEffect } from 'react';
import { Lock, Mail, Fingerprint, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { apiRequest, setAuthToken } from './api';
import { UserProfile } from '../../types';

interface LoginViewProps {
  onSuccess: (user: UserProfile) => void;
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSuccess,
  onNavigateToSignUp,
  onNavigateToForgotPassword
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBiometric, setHasBiometric] = useState(false);

  useEffect(() => {
    // Check if biometric authentication was previously activated on this device
    const savedBioToken = localStorage.getItem('mash_bio_token');
    const savedBioEmail = localStorage.getItem('mash_bio_email');
    if (savedBioToken && savedBioEmail) {
      setHasBiometric(true);
      if (!identifier) {
        setIdentifier(savedBioEmail);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError('Please enter your email or phone number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ success: boolean; token: string; user: UserProfile }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier: identifier.trim(), password })
        }
      );

      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    const savedBioToken = localStorage.getItem('mash_bio_token');
    const savedBioEmail = localStorage.getItem('mash_bio_email');

    if (!savedBioToken || !savedBioEmail) {
      setError('Biometric login is not yet enabled on this device. Please log in with your password first and enable Biometric Login under Profile > Security.');
      return;
    }

    setBiometricLoading(true);
    try {
      const data = await apiRequest<{ success: boolean; token: string; user: UserProfile }>(
        '/auth/biometric/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: savedBioEmail, biometricToken: savedBioToken })
        }
      );

      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Biometric authentication failed. Please enter your password.');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-black text-2xl mb-3 shadow-lg shadow-emerald-900/30">
            M
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Mash DataSub</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to manage your data & utility services</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Email or Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-5 h-5" />
              </div>
              <input
                id="login-identifier-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="name@example.com or 080..."
                className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <button
                id="login-forgot-password-link"
                type="button"
                onClick={onNavigateToForgotPassword}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-11 pr-11 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            id="login-submit-button"
            type="submit"
            disabled={loading || biometricLoading}
            className="w-full mt-2 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Biometric Login */}
        <div className="mt-4">
          <button
            id="login-biometric-button"
            type="button"
            onClick={handleBiometricLogin}
            disabled={loading || biometricLoading}
            className={`w-full py-3 px-4 border rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              hasBiometric
                ? 'bg-slate-800/80 hover:bg-slate-800 border-emerald-500/40 text-emerald-400 hover:text-emerald-300'
                : 'bg-slate-800/40 hover:bg-slate-800/70 border-slate-700 text-slate-400'
            }`}
          >
            {biometricLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5" />
            )}
            <span>{hasBiometric ? 'Login with Biometrics' : 'Biometric Login'}</span>
          </button>
        </div>

        {/* Sign Up Redirect */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-slate-400 text-sm">
            Don't have an account?{' '}
            <button
              id="login-signup-link"
              type="button"
              onClick={onNavigateToSignUp}
              className="text-emerald-400 font-bold hover:underline"
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
