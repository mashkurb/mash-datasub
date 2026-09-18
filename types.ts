export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'CUSTOMER' | 'ADMIN' | 'OWNER';
  walletBalance: number;
  hasPin: boolean;
  biometricEnabled?: boolean;
  referralCode: string;
  createdAt?: string;
}

export interface DataPlan {
  id: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  category: 'SME' | 'Corporate' | 'Gift';
  name: string;
  dataAmount: string;
  validity: string;
  sellingPrice: number;
  apiPrice?: number | null;
  providerCode?: string;
  rapidBillsId?: string | number;
  providerName?: string;
  lastSyncAt?: string;
  syncStatus?: 'SYNCED' | 'NOT_SYNCED' | 'UNAVAILABLE';
  isAvailable?: boolean;
}

export interface TransactionItem {
  id: string;
  reference: string;
  service: 'DATA' | 'AIRTIME' | 'ELECTRICITY' | 'TV' | 'EXAM_PIN' | 'AIRTIME_CASH' | 'WALLET_FUNDING' | 'MANUAL_ADJUSTMENT';
  description: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  status: 'Pending' | 'Successful' | 'Failed' | 'Reversed';
  metadata: Record<string, any>;
  createdAt: string;
}

export interface SystemStatus {
  name: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  servicesAvailability: {
    data: boolean;
    airtime: boolean;
    electricity: boolean;
    tv: boolean;
    examPin: boolean;
    airtimeToCash: boolean;
  };
  support: {
    phone: string;
    whatsapp: string;
    whatsappUrl: string;
    callUrl: string;
  };
}

export interface ReceiptData {
  title: string;
  service: string;
  reference: string;
  amount: number;
  status: 'Successful' | 'Pending' | 'Failed' | 'Reversed';
  date: string;
  recipient?: string;
  details?: Record<string, any>;
}

export interface DedicatedVirtualAccount {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankSlug?: string;
  provider: 'PAYSTACK' | 'FLUTTERWAVE' | 'MONNIFY';
  status: 'ACTIVE' | 'PENDING' | 'NOT_ELIGIBLE' | 'FAILED' | 'DISABLED';
  failureReason?: string;
  orderRef?: string;
  flwRef?: string;
  bvnProvided?: boolean;
  totalReceived: number;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayStatus {
  paystack: boolean;
  flutterwave: boolean;
  monnify?: boolean;
  squad?: boolean;
}

export interface AirtimeCashRequest {
  id: string;
  reference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  senderPhone: string;
  airtimeAmount: number;
  rate: number;
  expectedPayout: number;
  fee: number;
  payoutDestination: 'WALLET' | 'BANK';
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  customerNotes?: string;
  adminNotes?: string;
  recipientPhone: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AirtimeCashSettings {
  enabled: boolean;
  rates: {
    MTN: number;
    AIRTEL: number;
    GLO: number;
    '9MOBILE': number;
  };
  recipientPhones: {
    MTN: string;
    AIRTEL: string;
    GLO: string;
    '9MOBILE': string;
  };
  transferCodes: {
    MTN: string;
    AIRTEL: string;
    GLO: string;
    '9MOBILE': string;
  };
  minAmount: number;
  maxAmount: number;
  fee: number;
  payoutWorkflow: 'WALLET' | 'MANUAL_BANK';
  requireAdminApproval: boolean;
  instructions: string;
}

export interface DynamicServiceField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'tel' | 'email';
  placeholder?: string;
  required: boolean;
  options?: { label: string; value: string; price?: number }[];
  helperText?: string;
  defaultValue?: string | number;
}

export interface DynamicService {
  id: string;
  name: string;
  category: 'telecom' | 'utility' | 'entertainment' | 'education' | 'finance' | 'other';
  description: string;
  icon: string;
  enabled: boolean;
  customerVisible: boolean;
  statusMessage?: string;
  provider: string;
  pricingType: 'fixed' | 'range' | 'catalog' | 'percentage';
  fixedPrice?: number;
  minAmount?: number;
  maxAmount?: number;
  fee?: number;
  fields: DynamicServiceField[];
  settings?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminOverviewMetrics {
  totalCustomers: number;
  activeCustomers: number;
  totalWalletBalance: number;
  totalFunding: number;
  totalSales: number;
  totalTransactions: number;
  successfulTransactionsCount: number;
  pendingTransactionsCount: number;
  failedTransactionsCount: number;
  todayTransactionsCount: number;
  todayVolume: number;
  airtimeCashPending: number;
  airtimeCashCompleted: number;
  airtimeCashTotalPayout: number;
  activeServicesCount: number;
  totalServicesCount: number;
}

