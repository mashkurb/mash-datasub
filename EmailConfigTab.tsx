import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle2, AlertCircle, Loader2, Save, Send, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../api';

export const EmailConfigTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email Config state
  const [gmailUser, setGmailUser] = useState('');
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  const [fromName, setFromName] = useState('Mash DataSub');
  const [isConfigured, setIsConfigured] = useState(false);

  // Test state
  const [testRecipient, setTestRecipient] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadEmailConfig();
  }, []);

  const loadEmailConfig = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        configured: boolean;
        gmailUser: string;
        gmailAppPassword: string;
        hasPassword: boolean;
        fromName: string;
      }>('/admin/email-config');

      setGmailUser(data.gmailUser || '');
      setGmailAppPassword(data.gmailAppPassword || '');
      setFromName(data.fromName || 'Mash DataSub');
      setIsConfigured(data.configured);
      setTestRecipient(data.gmailUser || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load email configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiRequest('/admin/email-config', {
        method: 'PUT',
        body: JSON.stringify({
          gmailUser,
          gmailAppPassword,
          fromName
        })
      });

      setMessage('Gmail SMTP configuration saved successfully.');
      setTimeout(() => setMessage(null), 3500);
      loadEmailConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to update email settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/admin/test/email', {
        method: 'POST',
        body: JSON.stringify({
          gmailUser,
          gmailAppPassword,
          recipientEmail: testRecipient
        })
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Email delivery failed. Verify your Gmail address and 16-character App Password.'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Loading Email &amp; SMTP configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Configuration Card */}
      <form onSubmit={handleSave} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Gmail SMTP &amp; OTP Service</h3>
              <p className="text-[11px] text-slate-400">Used for registration OTPs, password reset codes &amp; receipts</p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-[10px] font-extrabold ${
              isConfigured
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {isConfigured ? 'Active & Configured' : 'Needs Setup'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Sender Email (Gmail)
            </label>
            <input
              type="email"
              required
              value={gmailUser}
              onChange={(e) => setGmailUser(e.target.value)}
              placeholder="e.g. balamashkur37@gmail.com"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Sender Display Name
            </label>
            <input
              type="text"
              required
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Mash DataSub"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Google App Password (16 Characters)
            </label>
            <input
              type="text"
              value={gmailAppPassword}
              onChange={(e) => setGmailAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx (leave masked to keep existing)"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Generated in your Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App passwords.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-xs transition-all"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Email Settings...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Email Configuration</span>
            </>
          )}
        </button>
      </form>

      {/* Test Email Section */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Live Email Delivery Test</h4>
            <p className="text-[10px] text-slate-400">Send an immediate test message through your Gmail configuration</p>
          </div>
        </div>

        <form onSubmit={handleTestEmail} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Recipient Email Address
            </label>
            <input
              type="email"
              required
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="e.g. balamashkur37@gmail.com"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-medium focus:border-emerald-500"
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={testing || !gmailUser}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-blue-400 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Dispatching Test Email...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send Test Email Now</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
