import React from 'react';
import { Home, History, Wallet, User } from 'lucide-react';

export type CustomerTab = 'home' | 'transactions' | 'wallet' | 'profile';

interface BottomNavProps {
  currentTab: CustomerTab;
  onSelectTab: (tab: CustomerTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  const tabs = [
    { id: 'home' as CustomerTab, label: 'Home', icon: Home },
    { id: 'transactions' as CustomerTab, label: 'Transactions', icon: History },
    { id: 'wallet' as CustomerTab, label: 'Wallet', icon: Wallet },
    { id: 'profile' as CustomerTab, label: 'Profile', icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800">
      <div className="max-w-md mx-auto grid grid-cols-4 px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 mb-1 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className="text-[11px] leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
