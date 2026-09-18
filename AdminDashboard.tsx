import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  ArrowLeft,
  Wifi,
  CreditCard,
  Building2,
  Cpu,
  Mail,
  ArrowRightLeft,
  Zap,
  Users,
  Sliders,
  FileText,
  RefreshCw,
  Check,
  X,
  Lock,
  Server,
  Activity,
  Layers
} from 'lucide-react';
import { apiRequest } from '../../api';
import { UserProfile, DataPlan, SystemStatus } from '../../types';

// Admin Sub-tabs
import { OverviewMetricsTab } from './OverviewMetricsTab';
import { AirtimeCashTab } from './AirtimeCashTab';
import { DynamicServicesTab } from './DynamicServicesTab';
import { DataPlansTab } from './DataPlansTab';
import { PaymentGatewaysTab } from './PaymentGatewaysTab';
import { VirtualAccountsTab } from './VirtualAccountsTab';
import { VtuProviderTab } from './VtuProviderTab';
import { EmailConfigTab } from './EmailConfigTab';
import { TransfersAndPricingTab } from './TransfersAndPricingTab';
import { ServicesConfigTab } from './ServicesConfigTab';
import { UsersManagementTab } from './UsersManagementTab';

interface AdminDashboardProps {
  user: UserProfile;
  onExitAdmin: () => void;
}

type AdminTab =
  | 'overview'
  | 'airtime-cash'
  | 'dynamic-services'
  | 'readiness'
  | 'plans'
  | 'gateways'
  | 'virtual-accounts'
  | 'vtu'
  | 'email'
  | 'pricing'
  | 'services'
  | 'users'
  | 'system'
  | 'logs';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onExitAdmin }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // System settings state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Audit logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSystemStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
    if (activeTab === 'system') loadSystemStatus();
  }, [activeTab]);

  const loadSystemStatus = async () => {
    setStatusLoading(true);
    try {
      const data = await apiRequest<SystemStatus>('/admin/system-status');
      setSystemStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await apiRequest<{ logs: any[] }>('/admin/logs');
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    if (!systemStatus) return;
    const newVal = !systemStatus.maintenanceMode;
    try {
      await apiRequest('/admin/maintenance', {
        method: 'POST',
        body: JSON.stringify({ enabled: newVal })
      });
      loadSystemStatus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleRegistration = async () => {
    if (!systemStatus) return;
    const newVal = !systemStatus.registrationEnabled;
    try {
      await apiRequest('/admin/registration', {
        method: 'POST',
        body: JSON.stringify({ enabled: newVal })
      });
      loadSystemStatus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleService = async (serviceKey: string) => {
    if (!systemStatus) return;
    const currentVal = (systemStatus.servicesAvailability as any)[serviceKey];
    try {
      await apiRequest('/admin/service-availability', {
        method: 'POST',
        body: JSON.stringify({ service: serviceKey, enabled: !currentVal })
      });
      loadSystemStatus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const navItems: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Command Center', icon: Activity },
    { id: 'airtime-cash', label: 'Airtime to Cash', icon: RefreshCw },
    { id: 'dynamic-services', label: 'Dynamic Services', icon: Layers },
    { id: 'readiness', label: 'Production Readiness', icon: ShieldCheck },
    { id: 'plans', label: 'Data Plans', icon: Wifi },
    { id: 'gateways', label: 'Payment Gateways', icon: CreditCard },
    { id: 'virtual-accounts', label: 'Virtual Accounts', icon: Building2 },
    { id: 'vtu', label: 'VTU Engine', icon: Cpu },
    { id: 'email', label: 'Email & OTP', icon: Mail },
    { id: 'pricing', label: 'Transfers & Pricing', icon: ArrowRightLeft },
    { id: 'services', label: 'Legacy Services', icon: Zap },
    { id: 'users', label: 'Users & Wallets', icon: Users },
    { id: 'system', label: 'System Toggles', icon: Sliders },
    { id: 'logs', label: 'Audit Logs', icon: FileText }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      {/* Admin Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white">Mash DataSub — Master Admin Control</h1>
            <p className="text-[10px] text-slate-400">Signed in as {user.role} ({user.email})</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onExitAdmin}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Customer App</span>
        </button>
      </header>

      {/* Admin Horizontal Nav Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-slate-800 text-xs font-bold no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 rounded-xl whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Global Feedback Banners */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {message && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="mt-5">
          {/* TAB: COMMAND CENTER OVERVIEW */}
          {activeTab === 'overview' && (
            <OverviewMetricsTab onNavigateTab={(tab) => setActiveTab(tab as AdminTab)} />
          )}

          {/* TAB: AIRTIME TO CASH OPERATIONS */}
          {activeTab === 'airtime-cash' && <AirtimeCashTab />}

          {/* TAB: DYNAMIC SERVICES MANAGEMENT */}
          {activeTab === 'dynamic-services' && <DynamicServicesTab />}

          {/* TAB 0: PRODUCTION READINESS */}
          {activeTab === 'readiness' && <PaymentGatewaysTab />}

          {/* TAB 1: DATA PRICING & PROVIDER CATALOG */}
          {activeTab === 'plans' && <DataPlansTab />}

          {/* TAB 2: PAYMENT GATEWAYS */}
          {activeTab === 'gateways' && <PaymentGatewaysTab />}

          {/* TAB: VIRTUAL ACCOUNTS (DVA) */}
          {activeTab === 'virtual-accounts' && <VirtualAccountsTab />}

          {/* TAB 3: VTU ENGINE */}
          {activeTab === 'vtu' && <VtuProviderTab />}

          {/* TAB 4: EMAIL & OTP */}
          {activeTab === 'email' && <EmailConfigTab />}

          {/* TAB 5: TRANSFERS & AIRTIME PRICING */}
          {activeTab === 'pricing' && <TransfersAndPricingTab />}

          {/* TAB 6: SERVICES CONFIG */}
          {activeTab === 'services' && <ServicesConfigTab />}

          {/* TAB 7: USERS & WALLETS */}
          {activeTab === 'users' && <UsersManagementTab />}

          {/* TAB 8: SYSTEM TOGGLES */}
          {activeTab === 'system' && systemStatus && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Maintenance Mode</div>
                    <div className="text-[11px] text-slate-400">Suspend purchases during core server maintenance</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMaintenance}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      systemStatus.maintenanceMode
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {systemStatus.maintenanceMode ? 'ACTIVE (LOCKED)' : 'OFF (NORMAL)'}
                  </button>
                </div>

                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Customer Registration</div>
                    <div className="text-[11px] text-slate-400">Allow new customers to create accounts</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleRegistration}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      systemStatus.registrationEnabled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {systemStatus.registrationEnabled ? 'ENABLED' : 'PAUSED'}
                  </button>
                </div>
              </div>

              {/* Service Availability Switches */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Customer Feature Availability (Live Toggles)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(systemStatus.servicesAvailability).map(([srvKey, isAvailable]) => (
                    <div
                      key={srvKey}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <span className="font-bold uppercase text-slate-300">{srvKey}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleService(srvKey)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                          isAvailable
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {isAvailable ? 'ACTIVE' : 'OFFLINE'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">System Audit &amp; Activity Log</h2>
                <button
                  type="button"
                  onClick={loadLogs}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {logsLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading audit trail...</div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
                  {logs.map((lg) => (
                    <div key={lg.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-white">{lg.action}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{lg.details}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">Admin: {lg.actorEmail}</div>
                      </div>
                      <div className="text-[10px] text-slate-400 whitespace-nowrap font-mono">
                        {new Date(lg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
