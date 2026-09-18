import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Phone,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Lock,
  ChevronDown,
  Check,
  Search
} from 'lucide-react';
import { apiRequest } from '../../api';
import { DataPlan, UserProfile, ReceiptData } from '../../types';
import { PaymentConfirmationModal } from './PaymentConfirmationModal';
import { sanitizeNigerianPhoneInput, validateNigerianPhone } from '../../utils/phoneValidation';

interface DataPurchaseViewProps {
  user: UserProfile;
  onBack: () => void;
  onSuccess: (receipt: ReceiptData, newBalance: number) => void;
  onPromptSetPin: () => void;
  onOpenFundWallet?: () => void;
}

export const DataPurchaseView: React.FC<DataPurchaseViewProps> = ({
  user,
  onBack,
  onSuccess,
  onPromptSetPin,
  onOpenFundWallet
}) => {
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const [selectedNetwork, setSelectedNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('MTN');
  const [selectedCategory, setSelectedCategory] = useState<'SME' | 'Corporate' | 'Gift'>('SME');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [showPlanDropdown, setShowPlanDropdown] = useState<boolean>(false);
  const [planSearch, setPlanSearch] = useState<string>('');
  const [phone, setPhone] = useState(sanitizeNigerianPhoneInput(user.phone || ''));

  // Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networks: Array<{ id: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'; label: string; color: string; border: string }> = [
    { id: 'MTN', label: 'MTN', color: 'bg-amber-500 text-slate-950 font-black', border: 'border-amber-400' },
    { id: 'AIRTEL', label: 'Airtel', color: 'bg-red-600 text-white font-black', border: 'border-red-500' },
    { id: 'GLO', label: 'Glo', color: 'bg-emerald-600 text-white font-black', border: 'border-emerald-500' },
    { id: '9MOBILE', label: '9mobile', color: 'bg-lime-500 text-slate-950 font-black', border: 'border-lime-400' }
  ];

  const categories: Array<{ id: 'SME' | 'Corporate' | 'Gift'; label: string }> = [
    { id: 'SME', label: 'SME' },
    { id: 'Corporate', label: 'Corporate' },
    { id: 'Gift', label: 'Gifting' }
  ];

  // Fetch real plans from backend catalog (Admin controlled source of truth!)
  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoadingPlans(true);
    setError(null);
    try {
      const data = await apiRequest<any>('/catalog/data-plans');
      if (Array.isArray(data)) {
        setPlans(data);
        if (data.length === 0) {
          setError('RapidBills VTU Provider is Not Configured. Live plans will appear once configured in the Admin Panel.');
        }
      } else if (data && Array.isArray(data.plans)) {
        setPlans(data.plans);
        if (data.configured === false || data.plans.length === 0) {
          setError(data.message || 'RapidBills VTU Provider is Not Configured. Live plans will appear once configured in the Admin Panel.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load live data plans from catalog.');
    } finally {
      setLoadingPlans(false);
    }
  };

  // Filter plans based on selected network & category
  const filteredPlans = plans.filter(
    (p) => p.network === selectedNetwork && p.category === selectedCategory
  );

  // If previous plan doesn't match new filter, reset selection so customer chooses
  useEffect(() => {
    setShowPlanDropdown(false);
    if (filteredPlans.length > 0) {
      const exists = filteredPlans.some((p) => p.id === selectedPlanId);
      if (!exists) {
        setSelectedPlanId('');
      }
    } else {
      setSelectedPlanId('');
    }
  }, [selectedNetwork, selectedCategory, plans]);

  // Quick search filtering inside the plan list dropdown
  const displayedPlans = filteredPlans.filter((p) => {
    if (!planSearch.trim()) return true;
    const q = planSearch.toLowerCase();
    return (
      p.dataAmount.toLowerCase().includes(q) ||
      (p.validity && p.validity.toLowerCase().includes(q)) ||
      p.sellingPrice.toString().includes(q)
    );
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleStartPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlan) {
      setError('Please tap "Choose Data Plan" to view and select your data bundle.');
      setShowPlanDropdown(true);
      return;
    }

    const phoneValidation = validateNigerianPhone(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.errorMessage || 'Please enter a valid 11-digit Nigerian phone number.');
      return;
    }

    if (!user.hasPin) {
      onPromptSetPin();
      return;
    }

    setShowConfirmModal(true);
  };

  const handleExecutePurchaseWithPin = async (inputPin: string) => {
    setPurchasing(true);
    setError(null);

    try {
      const response = await apiRequest<{
        success: boolean;
        reference: string;
        status: 'Successful' | 'Pending';
        service: string;
        network: string;
        dataAmount: string;
        recipient: string;
        amount: number;
        newBalance: number;
        date: string;
        message: string;
      }>('/services/data/purchase', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlan!.id,
          phone: phone.trim(),
          pin: inputPin
        })
      });

      setShowConfirmModal(false);

      const receipt: ReceiptData = {
        title: 'Data Bundle Top-up',
        service: `${response.network} ${selectedPlan!.category} ${response.dataAmount}`,
        reference: response.reference,
        amount: response.amount,
        status: response.status,
        date: response.date,
        recipient: response.recipient,
        details: {
          Network: response.network,
          Category: selectedPlan!.category,
          'Data Amount': response.dataAmount,
          Recipient: response.recipient,
          Validity: selectedPlan!.validity || '30 Days'
        }
      };

      onSuccess(receipt, response.newBalance);
    } catch (err: any) {
      throw new Error(err.message || 'Transaction failed. Please check your PIN and balance.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-white">
      {/* Top Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3.5 sticky top-0 z-20 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
        <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span>Buy Data Bundle</span>
        </h2>
        <div className="w-10" />
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-5">
        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Step 1: Select Network */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            1. Select Network
          </label>
          <div className="grid grid-cols-4 gap-2">
            {networks.map((net) => {
              const isSelected = selectedNetwork === net.id;
              return (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => setSelectedNetwork(net.id)}
                  className={`py-3 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                    isSelected
                      ? `${net.color} border-transparent shadow-lg scale-[1.02]`
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm">{net.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Select Category Tabs */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            2. Data Category
          </label>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Select Plan (Hidden until user taps) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              3. Choose Data Plan
            </label>
            <span className="text-[11px] text-slate-400">
              {filteredPlans.length} plans available
            </span>
          </div>

          {/* Selector Button - Always visible, plan list stays hidden until tapped */}
          <button
            type="button"
            id="tap-to-view-data-plans-button"
            onClick={() => setShowPlanDropdown((prev) => !prev)}
            className={`w-full p-3.5 bg-slate-900 border rounded-2xl text-left flex items-center justify-between transition-all active:scale-[0.99] ${
              showPlanDropdown
                ? 'border-emerald-500 ring-1 ring-emerald-500 bg-slate-900/90'
                : selectedPlan
                ? 'border-emerald-500/50 hover:border-emerald-500'
                : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            {selectedPlan ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">
                  {selectedPlan.dataAmount}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{selectedPlan.network} {selectedPlan.category} — {selectedPlan.dataAmount}</span>
                    <span className="text-[10px] text-slate-400">({selectedPlan.validity})</span>
                  </div>
                  <div className="text-xs font-black text-emerald-400 mt-0.5">
                    ₦{selectedPlan.sellingPrice.toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-slate-400 text-xs py-1">
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-200 text-xs">Tap to Select Data Plan</div>
                  <div className="text-[11px] text-slate-400">
                    Choose from {filteredPlans.length} available {selectedNetwork} {selectedCategory} packages
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {showPlanDropdown ? 'Tap to hide' : selectedPlan ? 'Change' : 'Select'}
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    showPlanDropdown ? 'rotate-180 text-emerald-400' : ''
                  }`}
                />
              </div>
            </div>
          </button>

          {/* Expandable Plan List (Hidden by default, shown ONLY when someone taps) */}
          {showPlanDropdown && (
            <div className="mt-2.5 p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-xl animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>Available {selectedNetwork} {selectedCategory} Packages</span>
                  <span className="text-[10px] text-slate-400 font-normal">({filteredPlans.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPlanDropdown(false)}
                  className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/80 transition-colors"
                >
                  Hide List &times;
                </button>
              </div>

              {/* Quick Search inside dropdown if more than 3 plans */}
              {filteredPlans.length > 3 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    placeholder="Search size (e.g. 1GB, 2GB, 500MB)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {loadingPlans ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Loading catalog data plans...</p>
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No active plans found for {selectedNetwork} {selectedCategory}. Try another category above.
                </div>
              ) : displayedPlans.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No plans match &quot;{planSearch}&quot;. Try clearing your search.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {displayedPlans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setShowPlanDropdown(false); // Hide list immediately when customer taps a plan!
                        }}
                        className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-slate-950 border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-extrabold text-xs text-white">{plan.dataAmount}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{plan.validity}</div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                        </div>
                        <div className="mt-2.5 pt-1.5 border-t border-slate-800 font-black text-emerald-400 text-xs">
                          &#8358;{plan.sellingPrice.toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 4: Recipient Phone Number */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            4. Recipient Phone Number
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Phone className="w-4 h-4" />
            </div>
            <input
              type="tel"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(sanitizeNigerianPhoneInput(e.target.value))}
              placeholder="e.g. 08081419276"
              className="w-full pl-10 pr-20 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm font-medium font-mono"
            />
            <button
              type="button"
              onClick={() => setPhone(sanitizeNigerianPhoneInput(user.phone || ''))}
              className="absolute inset-y-1.5 right-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg transition-colors"
            >
              My Phone
            </button>
          </div>
        </div>

        {/* Selected Plan Summary Banner */}
        {selectedPlan && (
          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Total Amount:</span>
              <div className="text-lg font-black text-emerald-400">
                ₦{selectedPlan.sellingPrice.toLocaleString()}
              </div>
            </div>
            <div className="text-right text-xs text-slate-300">
              <div className="font-bold">{selectedPlan.network} {selectedPlan.dataAmount}</div>
              <div className="text-[11px] text-slate-400">{selectedPlan.category} ({selectedPlan.validity})</div>
            </div>
          </div>
        )}

        {/* Continue to Purchase Button */}
        <button
          type="button"
          onClick={handleStartPurchase}
          disabled={!selectedPlan}
          className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
        >
          <span>Continue to Confirmation</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Centralized Payment Confirmation & PIN Modal */}
      {selectedPlan && (
        <PaymentConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          serviceTitle={`${selectedPlan.network} ${selectedPlan.category} Data`}
          details={[
            { label: 'Network Provider', value: selectedPlan.network },
            { label: 'Data Plan', value: selectedPlan.dataAmount, isHighlight: true },
            { label: 'Plan Category', value: selectedPlan.category },
            { label: 'Validity Period', value: selectedPlan.validity || '30 Days' },
            { label: 'Recipient Phone', value: phone },
            { label: 'Unit Price', value: `₦${selectedPlan.sellingPrice.toLocaleString()}` }
          ]}
          totalAmount={selectedPlan.sellingPrice}
          userBalance={user.walletBalance}
          hasPin={user.hasPin}
          onPromptSetPin={onPromptSetPin}
          onOpenFundWallet={onOpenFundWallet || onPromptSetPin}
          onConfirmWithPin={handleExecutePurchaseWithPin}
          isProcessing={purchasing}
          error={error}
          onClearError={() => setError(null)}
        />
      )}
    </div>
  );
};
