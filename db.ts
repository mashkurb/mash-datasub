import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  fullName: string;
  name?: string; // Compatibility alias
  email: string;
  phone: string;
  passwordHash: string;
  role: 'CUSTOMER' | 'ADMIN' | 'OWNER';
  status?: 'ACTIVE' | 'SUSPENDED';
  isVerified: boolean;
  walletBalance: number;
  transactionPinHash?: string;
  biometricToken?: string;
  referralCode: string;
  referredBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtpRecord {
  id: string;
  identifier: string; // email or phone
  code: string;
  type: 'registration' | 'forgot_password';
  expiresAt: number; // timestamp ms
  used: boolean;
  attempts: number;
  createdAt: string;
}

export interface DataPlan {
  id: string;
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  category: 'SME' | 'Corporate' | 'Gift';
  name: string;
  dataAmount: string;
  validity: string;
  sellingPrice: number; // Admin-controlled source of truth!
  apiPrice?: number | null; // Real provider / RapidBills price for this product
  providerCode: string; // RapidBills bundle ID or provider product SKU
  rapidBillsId?: string | number; // Explicit RapidBills bundle ID
  providerName?: string; // e.g. 'RapidBills'
  lastSyncAt?: string; // ISO string when API price was last synced
  syncStatus?: 'SYNCED' | 'NOT_SYNCED' | 'UNAVAILABLE';
  isAvailable: boolean;
}

export interface DedicatedVirtualAccount {
  id: string; // Internal record ID
  userId: string; // Customer ID in Mash DataSub
  userName: string;
  userEmail: string;
  userPhone: string;
  paystackCustomerId?: string | number; // Paystack customer ID
  customerCode?: string; // Paystack customer code (e.g. CUS_...)
  dvaId?: string | number; // Dedicated virtual account ID from provider
  accountNumber: string; // Real NUBAN account number (empty if not yet provisioned)
  accountName: string; // Account name from provider
  bankName: string; // Bank name (e.g. Wema Bank, Sterling Bank, GTBank)
  bankSlug?: string;
  provider: 'PAYSTACK' | 'POCKETAPP' | 'SQUAD' | 'FLUTTERWAVE' | string;
  reference?: string;
  orderRef?: string; // Flutterwave order_ref or external ref
  flwRef?: string; // Flutterwave flw_ref
  bvnProvided?: boolean;
  status: 'ACTIVE' | 'PENDING' | 'FAILED' | 'NOT_ELIGIBLE' | 'DISABLED';
  failureReason?: string;
  totalReceived: number; // Cumulative total ₦ credited via DVA
  lastFundingAt?: string; // ISO timestamp of last funding
  lastFundingReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  provider: 'PAYSTACK' | 'POCKETAPP' | 'SQUAD' | 'FLUTTERWAVE' | string;
  providerTransactionId?: string;
  reference: string;
  amount: number;
  providerFee: number;
  netAmount: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REVERSED' | 'REFUNDED';
  paymentMethod?: string;
  channel?: string;
  authorizationUrl?: string;
  checkoutUrl?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  paidAt?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventType: string;
  reference?: string;
  providerTransactionId?: string;
  processed: boolean;
  status: 'SUCCESS' | 'IGNORED' | 'FAILED';
  payload: Record<string, any>;
  createdAt: string;
}

export interface Transaction {
  id: string;
  reference: string;
  userId: string;
  userEmail: string;
  userName: string;
  service: 'DATA' | 'AIRTIME' | 'ELECTRICITY' | 'TV' | 'EXAM_PIN' | 'AIRTIME_CASH' | 'WALLET_FUNDING' | 'MANUAL_ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN';
  description: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  status: 'Pending' | 'Successful' | 'Failed' | 'Reversed';
  metadata: Record<string, any>;
  providerReference?: string;
  providerResponse?: string;
  paymentProvider?: string;
  dedicatedAccountNumber?: string;
  createdAt: string;
}

export interface ElectricityProvider {
  id: string;
  name: string;
  enabled: boolean;
  fee: number;
  outageStatus: boolean;
}

export interface TvPackage {
  id: string;
  name: string;
  price: number;
  enabled: boolean;
}

export interface TvProvider {
  id: string;
  name: string;
  enabled: boolean;
  fee: number;
  packages: TvPackage[];
}

export interface ExamPinProduct {
  id: string;
  name: string;
  enabled: boolean;
  sellingPrice: number;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  transferEnabled: boolean;
  customerToCustomerTransferEnabled: boolean;
  transferFeeType: 'free' | 'flat' | 'percentage';
  transferFixedFee: number;
  transferPercentFee: number;
  transferFeePayer: 'SENDER' | 'RECIPIENT';
  minTransferAmount: number;
  maxTransferAmount: number;
  dailyTransferLimit: number;
  transferCharge: number; // Admin-controlled transfer charge in NGN (legacy alias)
  generalTransactionChargePercent: number; // Optional percentage charge
  servicesAvailability: {
    data: boolean;
    airtime: boolean;
    electricity: boolean;
    tv: boolean;
    examPin: boolean;
    airtimeToCash: boolean;
    transfer: boolean;
  };
  airtimePricing: {
    customerDiscountPercent: number; // e.g. 2% discount
    serviceFee: number; // flat fee in NGN
    generalTransactionChargePercent: number;
  };
  serviceCharges: {
    electricityFee: number;
    tvFee: number;
    waecPrice: number;
    necoPrice: number;
    nabtebPrice: number;
  };
  electricityProviders: ElectricityProvider[];
  tvProviders: TvProvider[];
  examPinProducts: ExamPinProduct[];
  airtimeCashRates: {
    MTN: number;
    AIRTEL: number;
    GLO: number;
    '9MOBILE': number;
  };
  airtimeCashAdminPhone: string;
  airtimeCashSettings?: AirtimeCashSettings;
  paymentGatewayConfig: {
    activeProvider: 'PAYSTACK' | 'MONNIFY' | string;
    backupProvider: 'NONE' | 'PAYSTACK' | 'MONNIFY' | string;
    environment: 'test' | 'live';
    virtualAccountsEnabled: boolean;
    providers: {
      paystack: {
        enabled: boolean;
        mode: 'test' | 'live';
        publicKey: string;
        secretKey: string;
        virtualAccountsEnabled: boolean;
      };
      monnify: {
        enabled: boolean;
        mode: 'test' | 'live';
        apiKey: string;
        secretKey: string;
        contractCode: string;
        baseUrl: string;
        virtualAccountsEnabled: boolean;
      };
      pocketapp?: {
        enabled: boolean;
        mode: 'test' | 'live';
        apiKey: string;
        secretKey: string;
        merchantId?: string;
        virtualAccountsEnabled: boolean;
      };
      squad?: {
        enabled: boolean;
        mode: 'test' | 'live';
        publicKey: string;
        secretKey: string;
        apiKey?: string;
        baseUrl?: string;
        merchantId?: string;
        virtualAccountsEnabled: boolean;
      };
      flutterwave?: {
        enabled: boolean;
        mode: 'test' | 'live';
        publicKey: string;
        secretKey: string;
        secretHash: string;
        encryptionKey?: string;
        virtualAccountsEnabled: boolean;
      };
    };
  };
  paymentGateways: {
    paystack: {
      enabled: boolean;
      mode: 'test' | 'live';
      publicKey: string;
      secretKey: string;
    };
    flutterwave: {
      enabled: boolean;
      mode: 'test' | 'live';
      publicKey: string;
      secretKey: string;
      secretHash: string;
      encryptionKey?: string;
    };
    monnify: {
      enabled: boolean;
      mode: 'sandbox' | 'live';
      apiKey: string;
      secretKey: string;
      contractCode: string;
      accountNumber?: string;
    };
  };
  vtuProvider: {
    providerName: 'RAPIDBILLS' | 'OTHER';
    enabled: boolean;
    mode: 'test' | 'live';
    apiKey: string;
    userId: string;
    apiUrl: string;
  };
  emailConfig: {
    configured: boolean;
    gmailUser: string;
    gmailAppPassword: string;
    fromName: string;
    smtpHost?: string;
    smtpPort?: number;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorEmail: string;
  action: string;
  details: string;
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

export interface DatabaseSchema {
  users: User[];
  otps: OtpRecord[];
  dataPlans: DataPlan[];
  transactions: Transaction[];
  settings: SystemSettings;
  auditLogs: AuditLog[];
  dedicatedVirtualAccounts: DedicatedVirtualAccount[];
  paymentTransactions?: PaymentTransaction[];
  webhookEvents?: WebhookEvent[];
  airtimeCashRequests?: AirtimeCashRequest[];
  dynamicServices?: DynamicService[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default real Nigerian VTU Data Plans with baseline retail selling prices
// Covers small & normal sizes: 50MB, 100MB, 200MB, 500MB, 1GB, 2GB, 3GB, 5GB, 10GB
// And validities: 1 Day, 2 Days, 3 Days, 7 Days, 30 Days across MTN, Airtel, Glo, 9mobile
const DEFAULT_DATA_PLANS: DataPlan[] = [
  // ==================== MTN ====================
  // MTN SME
  { id: 'mtn-sme-500mb', network: 'MTN', category: 'SME', name: 'MTN SME 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 165, providerCode: 'MTN_SME_500MB', isAvailable: true },
  { id: 'mtn-sme-1gb-1d', network: 'MTN', category: 'SME', name: 'MTN SME 1GB (Daily)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 120, providerCode: 'MTN_SME_1GB_1D', isAvailable: true },
  { id: 'mtn-sme-1gb-2d', network: 'MTN', category: 'SME', name: 'MTN SME 1GB (2 Days)', dataAmount: '1GB', validity: '2 Days', sellingPrice: 150, providerCode: 'MTN_SME_1GB_2D', isAvailable: true },
  { id: 'mtn-sme-1gb-7d', network: 'MTN', category: 'SME', name: 'MTN SME 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 220, providerCode: 'MTN_SME_1GB_7D', isAvailable: true },
  { id: 'mtn-sme-1gb', network: 'MTN', category: 'SME', name: 'MTN SME 1GB (Monthly)', dataAmount: '1GB', validity: '30 Days', sellingPrice: 295, providerCode: 'MTN_SME_1GB', isAvailable: true },
  { id: 'mtn-sme-2gb-1d', network: 'MTN', category: 'SME', name: 'MTN SME 2GB (Daily)', dataAmount: '2GB', validity: '1 Day', sellingPrice: 240, providerCode: 'MTN_SME_2GB_1D', isAvailable: true },
  { id: 'mtn-sme-2gb-2d', network: 'MTN', category: 'SME', name: 'MTN SME 2GB (2 Days)', dataAmount: '2GB', validity: '2 Days', sellingPrice: 300, providerCode: 'MTN_SME_2GB_2D', isAvailable: true },
  { id: 'mtn-sme-2gb-7d', network: 'MTN', category: 'SME', name: 'MTN SME 2GB (7 Days)', dataAmount: '2GB', validity: '7 Days', sellingPrice: 450, providerCode: 'MTN_SME_2GB_7D', isAvailable: true },
  { id: 'mtn-sme-2gb', network: 'MTN', category: 'SME', name: 'MTN SME 2GB (Monthly)', dataAmount: '2GB', validity: '30 Days', sellingPrice: 590, providerCode: 'MTN_SME_2GB', isAvailable: true },
  { id: 'mtn-sme-3gb-1d', network: 'MTN', category: 'SME', name: 'MTN SME 3GB (Daily)', dataAmount: '3GB', validity: '1 Day', sellingPrice: 350, providerCode: 'MTN_SME_3GB_1D', isAvailable: true },
  { id: 'mtn-sme-3gb-2d', network: 'MTN', category: 'SME', name: 'MTN SME 3GB (2 Days)', dataAmount: '3GB', validity: '2 Days', sellingPrice: 440, providerCode: 'MTN_SME_3GB_2D', isAvailable: true },
  { id: 'mtn-sme-3gb-7d', network: 'MTN', category: 'SME', name: 'MTN SME 3GB (7 Days)', dataAmount: '3GB', validity: '7 Days', sellingPrice: 680, providerCode: 'MTN_SME_3GB_7D', isAvailable: true },
  { id: 'mtn-sme-3gb', network: 'MTN', category: 'SME', name: 'MTN SME 3GB (Monthly)', dataAmount: '3GB', validity: '30 Days', sellingPrice: 885, providerCode: 'MTN_SME_3GB', isAvailable: true },
  { id: 'mtn-sme-5gb', network: 'MTN', category: 'SME', name: 'MTN SME 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1475, providerCode: 'MTN_SME_5GB', isAvailable: true },
  { id: 'mtn-sme-10gb', network: 'MTN', category: 'SME', name: 'MTN SME 10GB', dataAmount: '10GB', validity: '30 Days', sellingPrice: 2950, providerCode: 'MTN_SME_10GB', isAvailable: true },

  // MTN Corporate
  { id: 'mtn-cg-50mb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 50MB', dataAmount: '50MB', validity: '1 Day', sellingPrice: 30, providerCode: 'MTN_CG_50MB', isAvailable: true },
  { id: 'mtn-cg-100mb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 100MB', dataAmount: '100MB', validity: '1 Day', sellingPrice: 50, providerCode: 'MTN_CG_100MB', isAvailable: true },
  { id: 'mtn-cg-200mb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 200MB', dataAmount: '200MB', validity: '3 Days', sellingPrice: 80, providerCode: 'MTN_CG_200MB', isAvailable: true },
  { id: 'mtn-cg-500mb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 175, providerCode: 'MTN_CG_500MB', isAvailable: true },
  { id: 'mtn-cg-1gb-1d', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 130, providerCode: 'MTN_CG_1GB_1D', isAvailable: true },
  { id: 'mtn-cg-1gb-7d', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 230, providerCode: 'MTN_CG_1GB_7D', isAvailable: true },
  { id: 'mtn-cg-1gb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 320, providerCode: 'MTN_CG_1GB', isAvailable: true },
  { id: 'mtn-cg-2gb-7d', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 2GB (7 Days)', dataAmount: '2GB', validity: '7 Days', sellingPrice: 480, providerCode: 'MTN_CG_2GB_7D', isAvailable: true },
  { id: 'mtn-cg-2gb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 640, providerCode: 'MTN_CG_2GB', isAvailable: true },
  { id: 'mtn-cg-3gb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 960, providerCode: 'MTN_CG_3GB', isAvailable: true },
  { id: 'mtn-cg-5gb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1600, providerCode: 'MTN_CG_5GB', isAvailable: true },
  { id: 'mtn-cg-10gb', network: 'MTN', category: 'Corporate', name: 'MTN Corporate 10GB', dataAmount: '10GB', validity: '30 Days', sellingPrice: 3200, providerCode: 'MTN_CG_10GB', isAvailable: true },

  // MTN Gift
  { id: 'mtn-gift-1gb-1d', network: 'MTN', category: 'Gift', name: 'MTN Gift 1GB (Daily)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 150, providerCode: 'MTN_GIFT_1GB_1D', isAvailable: true },
  { id: 'mtn-gift-1gb-7d', network: 'MTN', category: 'Gift', name: 'MTN Gift 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 250, providerCode: 'MTN_GIFT_1GB_7D', isAvailable: true },
  { id: 'mtn-gift-1gb', network: 'MTN', category: 'Gift', name: 'MTN Direct Gift 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 350, providerCode: 'MTN_GIFT_1GB', isAvailable: true },
  { id: 'mtn-gift-2gb-2d', network: 'MTN', category: 'Gift', name: 'MTN Gift 2GB (2 Days)', dataAmount: '2GB', validity: '2 Days', sellingPrice: 350, providerCode: 'MTN_GIFT_2GB_2D', isAvailable: true },
  { id: 'mtn-gift-2gb', network: 'MTN', category: 'Gift', name: 'MTN Direct Gift 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 700, providerCode: 'MTN_GIFT_2GB', isAvailable: true },
  { id: 'mtn-gift-3gb', network: 'MTN', category: 'Gift', name: 'MTN Direct Gift 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 1050, providerCode: 'MTN_GIFT_3GB', isAvailable: true },
  { id: 'mtn-gift-5gb', network: 'MTN', category: 'Gift', name: 'MTN Direct Gift 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1750, providerCode: 'MTN_GIFT_5GB', isAvailable: true },

  // ==================== AIRTEL ====================
  // Airtel SME
  { id: 'airtel-sme-500mb', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 170, providerCode: 'AIRTEL_SME_500MB', isAvailable: true },
  { id: 'airtel-sme-1gb-7d', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 220, providerCode: 'AIRTEL_SME_1GB_7D', isAvailable: true },
  { id: 'airtel-sme-1gb', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 1GB (30 Days)', dataAmount: '1GB', validity: '30 Days', sellingPrice: 310, providerCode: 'AIRTEL_SME_1GB', isAvailable: true },
  { id: 'airtel-sme-2gb', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 2GB (30 Days)', dataAmount: '2GB', validity: '30 Days', sellingPrice: 620, providerCode: 'AIRTEL_SME_2GB', isAvailable: true },
  { id: 'airtel-sme-3gb', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 3GB (30 Days)', dataAmount: '3GB', validity: '30 Days', sellingPrice: 930, providerCode: 'AIRTEL_SME_3GB', isAvailable: true },
  { id: 'airtel-sme-5gb', network: 'AIRTEL', category: 'SME', name: 'Airtel SME 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1550, providerCode: 'AIRTEL_SME_5GB', isAvailable: true },

  // Airtel Corporate
  { id: 'airtel-cg-50mb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 50MB', dataAmount: '50MB', validity: '1 Day', sellingPrice: 30, providerCode: 'AIRTEL_CG_50MB', isAvailable: true },
  { id: 'airtel-cg-100mb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 100MB', dataAmount: '100MB', validity: '1 Day', sellingPrice: 50, providerCode: 'AIRTEL_CG_100MB', isAvailable: true },
  { id: 'airtel-cg-200mb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 200MB', dataAmount: '200MB', validity: '3 Days', sellingPrice: 85, providerCode: 'AIRTEL_CG_200MB', isAvailable: true },
  { id: 'airtel-cg-500mb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 180, providerCode: 'AIRTEL_CG_500MB', isAvailable: true },
  { id: 'airtel-cg-1gb-1d', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 135, providerCode: 'AIRTEL_CG_1GB_1D', isAvailable: true },
  { id: 'airtel-cg-1gb-7d', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 235, providerCode: 'AIRTEL_CG_1GB_7D', isAvailable: true },
  { id: 'airtel-cg-1gb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 325, providerCode: 'AIRTEL_CG_1GB', isAvailable: true },
  { id: 'airtel-cg-2gb-7d', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 2GB (7 Days)', dataAmount: '2GB', validity: '7 Days', sellingPrice: 490, providerCode: 'AIRTEL_CG_2GB_7D', isAvailable: true },
  { id: 'airtel-cg-2gb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 650, providerCode: 'AIRTEL_CG_2GB', isAvailable: true },
  { id: 'airtel-cg-3gb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 975, providerCode: 'AIRTEL_CG_3GB', isAvailable: true },
  { id: 'airtel-cg-5gb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1625, providerCode: 'AIRTEL_CG_5GB', isAvailable: true },
  { id: 'airtel-cg-10gb', network: 'AIRTEL', category: 'Corporate', name: 'Airtel Corporate 10GB', dataAmount: '10GB', validity: '30 Days', sellingPrice: 3250, providerCode: 'AIRTEL_CG_10GB', isAvailable: true },

  // Airtel Gift
  { id: 'airtel-gift-1gb-1d', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gift 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 150, providerCode: 'AIRTEL_GIFT_1GB_1D', isAvailable: true },
  { id: 'airtel-gift-1gb-7d', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gift 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 260, providerCode: 'AIRTEL_GIFT_1GB_7D', isAvailable: true },
  { id: 'airtel-gift-1gb', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gifting 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 350, providerCode: 'AIRTEL_GIFT_1GB', isAvailable: true },
  { id: 'airtel-gift-2gb', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gifting 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 700, providerCode: 'AIRTEL_GIFT_2GB', isAvailable: true },
  { id: 'airtel-gift-3gb', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gifting 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 1050, providerCode: 'AIRTEL_GIFT_3GB', isAvailable: true },
  { id: 'airtel-gift-5gb', network: 'AIRTEL', category: 'Gift', name: 'Airtel Gifting 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1750, providerCode: 'AIRTEL_GIFT_5GB', isAvailable: true },

  // ==================== GLO ====================
  // Glo SME
  { id: 'glo-sme-500mb', network: 'GLO', category: 'SME', name: 'Glo SME 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 160, providerCode: 'GLO_SME_500MB', isAvailable: true },
  { id: 'glo-sme-1gb', network: 'GLO', category: 'SME', name: 'Glo SME 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 270, providerCode: 'GLO_SME_1GB', isAvailable: true },
  { id: 'glo-sme-2gb', network: 'GLO', category: 'SME', name: 'Glo SME 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 540, providerCode: 'GLO_SME_2GB', isAvailable: true },
  { id: 'glo-sme-3gb', network: 'GLO', category: 'SME', name: 'Glo SME 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 810, providerCode: 'GLO_SME_3GB', isAvailable: true },
  { id: 'glo-sme-5gb', network: 'GLO', category: 'SME', name: 'Glo SME 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1350, providerCode: 'GLO_SME_5GB', isAvailable: true },

  // Glo Corporate
  { id: 'glo-cg-50mb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 50MB', dataAmount: '50MB', validity: '1 Day', sellingPrice: 30, providerCode: 'GLO_CG_50MB', isAvailable: true },
  { id: 'glo-cg-100mb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 100MB', dataAmount: '100MB', validity: '1 Day', sellingPrice: 50, providerCode: 'GLO_CG_100MB', isAvailable: true },
  { id: 'glo-cg-200mb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 200MB', dataAmount: '200MB', validity: '3 Days', sellingPrice: 80, providerCode: 'GLO_CG_200MB', isAvailable: true },
  { id: 'glo-cg-500mb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 165, providerCode: 'GLO_CG_500MB', isAvailable: true },
  { id: 'glo-cg-1gb-1d', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 125, providerCode: 'GLO_CG_1GB_1D', isAvailable: true },
  { id: 'glo-cg-1gb-7d', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 215, providerCode: 'GLO_CG_1GB_7D', isAvailable: true },
  { id: 'glo-cg-1gb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 280, providerCode: 'GLO_CG_1GB', isAvailable: true },
  { id: 'glo-cg-2gb-7d', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 2GB (7 Days)', dataAmount: '2GB', validity: '7 Days', sellingPrice: 450, providerCode: 'GLO_CG_2GB_7D', isAvailable: true },
  { id: 'glo-cg-2gb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 560, providerCode: 'GLO_CG_2GB', isAvailable: true },
  { id: 'glo-cg-3gb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 840, providerCode: 'GLO_CG_3GB', isAvailable: true },
  { id: 'glo-cg-5gb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1400, providerCode: 'GLO_CG_5GB', isAvailable: true },
  { id: 'glo-cg-10gb', network: 'GLO', category: 'Corporate', name: 'Glo Corporate 10GB', dataAmount: '10GB', validity: '30 Days', sellingPrice: 2800, providerCode: 'GLO_CG_10GB', isAvailable: true },

  // Glo Gift
  { id: 'glo-gift-1gb-1d', network: 'GLO', category: 'Gift', name: 'Glo Gift 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 140, providerCode: 'GLO_GIFT_1GB_1D', isAvailable: true },
  { id: 'glo-gift-1gb-7d', network: 'GLO', category: 'Gift', name: 'Glo Gift 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 240, providerCode: 'GLO_GIFT_1GB_7D', isAvailable: true },
  { id: 'glo-gift-1gb', network: 'GLO', category: 'Gift', name: 'Glo Gift 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 300, providerCode: 'GLO_GIFT_1GB', isAvailable: true },
  { id: 'glo-gift-2gb', network: 'GLO', category: 'Gift', name: 'Glo Gift 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 600, providerCode: 'GLO_GIFT_2GB', isAvailable: true },
  { id: 'glo-gift-3gb', network: 'GLO', category: 'Gift', name: 'Glo Gift 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 900, providerCode: 'GLO_GIFT_3GB', isAvailable: true },
  { id: 'glo-gift-5gb', network: 'GLO', category: 'Gift', name: 'Glo Gift 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1500, providerCode: 'GLO_GIFT_5GB', isAvailable: true },

  // ==================== 9MOBILE ====================
  // 9mobile SME
  { id: '9mobile-sme-500mb', network: '9MOBILE', category: 'SME', name: '9mobile SME 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 150, providerCode: '9MOBILE_SME_500MB', isAvailable: true },
  { id: '9mobile-sme-1gb', network: '9MOBILE', category: 'SME', name: '9mobile SME 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 240, providerCode: '9MOBILE_SME_1GB', isAvailable: true },
  { id: '9mobile-sme-2gb', network: '9MOBILE', category: 'SME', name: '9mobile SME 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 480, providerCode: '9MOBILE_SME_2GB', isAvailable: true },
  { id: '9mobile-sme-3gb', network: '9MOBILE', category: 'SME', name: '9mobile SME 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 720, providerCode: '9MOBILE_SME_3GB', isAvailable: true },
  { id: '9mobile-sme-5gb', network: '9MOBILE', category: 'SME', name: '9mobile SME 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1200, providerCode: '9MOBILE_SME_5GB', isAvailable: true },

  // 9mobile Corporate
  { id: '9mobile-cg-50mb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 50MB', dataAmount: '50MB', validity: '1 Day', sellingPrice: 30, providerCode: '9MOBILE_CG_50MB', isAvailable: true },
  { id: '9mobile-cg-100mb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 100MB', dataAmount: '100MB', validity: '1 Day', sellingPrice: 45, providerCode: '9MOBILE_CG_100MB', isAvailable: true },
  { id: '9mobile-cg-200mb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 200MB', dataAmount: '200MB', validity: '3 Days', sellingPrice: 75, providerCode: '9MOBILE_CG_200MB', isAvailable: true },
  { id: '9mobile-cg-500mb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 500MB', dataAmount: '500MB', validity: '30 Days', sellingPrice: 155, providerCode: '9MOBILE_CG_500MB', isAvailable: true },
  { id: '9mobile-cg-1gb-1d', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 120, providerCode: '9MOBILE_CG_1GB_1D', isAvailable: true },
  { id: '9mobile-cg-1gb-7d', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 210, providerCode: '9MOBILE_CG_1GB_7D', isAvailable: true },
  { id: '9mobile-cg-1gb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 250, providerCode: '9MOBILE_CG_1GB', isAvailable: true },
  { id: '9mobile-cg-2gb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 500, providerCode: '9MOBILE_CG_2GB', isAvailable: true },
  { id: '9mobile-cg-3gb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 750, providerCode: '9MOBILE_CG_3GB', isAvailable: true },
  { id: '9mobile-cg-5gb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1250, providerCode: '9MOBILE_CG_5GB', isAvailable: true },
  { id: '9mobile-cg-10gb', network: '9MOBILE', category: 'Corporate', name: '9mobile Corporate 10GB', dataAmount: '10GB', validity: '30 Days', sellingPrice: 2500, providerCode: '9MOBILE_CG_10GB', isAvailable: true },

  // 9mobile Gift
  { id: '9mobile-gift-1gb-1d', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 1GB (1 Day)', dataAmount: '1GB', validity: '1 Day', sellingPrice: 140, providerCode: '9MOBILE_GIFT_1GB_1D', isAvailable: true },
  { id: '9mobile-gift-1gb-7d', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 1GB (7 Days)', dataAmount: '1GB', validity: '7 Days', sellingPrice: 230, providerCode: '9MOBILE_GIFT_1GB_7D', isAvailable: true },
  { id: '9mobile-gift-1gb', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 1GB', dataAmount: '1GB', validity: '30 Days', sellingPrice: 280, providerCode: '9MOBILE_GIFT_1GB', isAvailable: true },
  { id: '9mobile-gift-2gb', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 2GB', dataAmount: '2GB', validity: '30 Days', sellingPrice: 560, providerCode: '9MOBILE_GIFT_2GB', isAvailable: true },
  { id: '9mobile-gift-3gb', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 3GB', dataAmount: '3GB', validity: '30 Days', sellingPrice: 840, providerCode: '9MOBILE_GIFT_3GB', isAvailable: true },
  { id: '9mobile-gift-5gb', network: '9MOBILE', category: 'Gift', name: '9mobile Gift 5GB', dataAmount: '5GB', validity: '30 Days', sellingPrice: 1400, providerCode: '9MOBILE_GIFT_5GB', isAvailable: true }
];

export const DEFAULT_DYNAMIC_SERVICES: DynamicService[] = [
  {
    id: 'airtime',
    name: 'Airtime VTU',
    category: 'telecom',
    description: 'Instant recharge for MTN, Airtel, Glo, and 9mobile',
    icon: 'Smartphone',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'range',
    minAmount: 50,
    maxAmount: 50000,
    fields: [
      {
        name: 'network',
        label: 'Select Network',
        type: 'select',
        required: true,
        options: [
          { label: 'MTN Nigeria', value: 'MTN' },
          { label: 'Airtel Nigeria', value: 'AIRTEL' },
          { label: 'Glo Nigeria', value: 'GLO' },
          { label: '9mobile', value: '9MOBILE' }
        ]
      },
      {
        name: 'phone',
        label: 'Phone Number',
        type: 'tel',
        required: true,
        placeholder: 'e.g. 08012345678'
      },
      {
        name: 'amount',
        label: 'Airtime Amount (₦)',
        type: 'number',
        required: true,
        placeholder: 'Min ₦50 - Max ₦50,000'
      }
    ]
  },
  {
    id: 'data',
    name: 'Internet Data',
    category: 'telecom',
    description: 'SME, Corporate Gifting & Direct data bundles with instant delivery',
    icon: 'Wifi',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'catalog',
    fields: [
      {
        name: 'network',
        label: 'Network',
        type: 'select',
        required: true,
        options: [
          { label: 'MTN', value: 'MTN' },
          { label: 'Airtel', value: 'AIRTEL' },
          { label: 'Glo', value: 'GLO' },
          { label: '9mobile', value: '9MOBILE' }
        ]
      },
      {
        name: 'phone',
        label: 'Recipient Phone',
        type: 'tel',
        required: true,
        placeholder: 'e.g. 08012345678'
      },
      {
        name: 'planId',
        label: 'Data Bundle Plan',
        type: 'select',
        required: true
      }
    ]
  },
  {
    id: 'electricity',
    name: 'Electricity Bills',
    category: 'utility',
    description: 'Instant prepaid token generator & postpaid bill settlements',
    icon: 'Zap',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'range',
    minAmount: 500,
    maxAmount: 100000,
    fields: [
      {
        name: 'disco',
        label: 'Electricity Distribution Company (DisCo)',
        type: 'select',
        required: true,
        options: [
          { label: 'IKEDC - Ikeja Electric', value: 'IKEDC' },
          { label: 'EKEDC - Eko Electric', value: 'EKEDC' },
          { label: 'AEDC - Abuja Electric', value: 'AEDC' },
          { label: 'KEDCO - Kano Electric', value: 'KEDCO' },
          { label: 'PHED - Port Harcourt Electric', value: 'PHED' },
          { label: 'IBEDC - Ibadan Electric', value: 'IBEDC' },
          { label: 'EEDC - Enugu Electric', value: 'EEDC' },
          { label: 'BEDC - Benin Electric', value: 'BEDC' },
          { label: 'KAEDCO - Kaduna Electric', value: 'KAEDCO' },
          { label: 'JED - Jos Electric', value: 'JED' }
        ]
      },
      {
        name: 'meterType',
        label: 'Meter Type',
        type: 'select',
        required: true,
        options: [
          { label: 'Prepaid (Token Generation)', value: 'prepaid' },
          { label: 'Postpaid (Bill Settlement)', value: 'postpaid' }
        ]
      },
      {
        name: 'meterNumber',
        label: 'Meter Number',
        type: 'text',
        required: true,
        placeholder: 'Enter 11 or 13 digit meter number'
      },
      {
        name: 'amount',
        label: 'Amount to Recharge (₦)',
        type: 'number',
        required: true,
        placeholder: 'Minimum ₦500'
      },
      {
        name: 'phone',
        label: 'Customer Phone (for Token SMS)',
        type: 'tel',
        required: true,
        placeholder: '08012345678'
      }
    ]
  },
  {
    id: 'tv',
    name: 'Cable TV Subscription',
    category: 'entertainment',
    description: 'Instant recharge for DStv, GOtv, and StarTimes',
    icon: 'Tv',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'catalog',
    fields: [
      {
        name: 'provider',
        label: 'Select TV Provider',
        type: 'select',
        required: true,
        options: [
          { label: 'DStv Nigeria', value: 'DSTV' },
          { label: 'GOtv Nigeria', value: 'GOTV' },
          { label: 'StarTimes Nigeria', value: 'STARTIMES' }
        ]
      },
      {
        name: 'smartcardNumber',
        label: 'Smartcard / IUC Number',
        type: 'text',
        required: true,
        placeholder: 'Enter 10 or 11 digit smartcard number'
      },
      {
        name: 'packageId',
        label: 'Select Bouquet Package',
        type: 'select',
        required: true
      },
      {
        name: 'phone',
        label: 'Phone Number',
        type: 'tel',
        required: true,
        placeholder: '08012345678'
      }
    ]
  },
  {
    id: 'exam-pin',
    name: 'Exam Result PINs',
    category: 'education',
    description: 'Official result checker scratch PINs for WAEC, NECO, and NABTEB',
    icon: 'GraduationCap',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'fixed',
    fields: [
      {
        name: 'examType',
        label: 'Select Exam Board',
        type: 'select',
        required: true,
        options: [
          { label: 'WAEC Result Checker PIN (₦3,800)', value: 'WAEC' },
          { label: 'NECO Result Checker Token (₦1,500)', value: 'NECO' },
          { label: 'NABTEB Result Checker PIN (₦1,600)', value: 'NABTEB' }
        ]
      },
      {
        name: 'quantity',
        label: 'Quantity',
        type: 'number',
        required: true,
        defaultValue: 1
      },
      {
        name: 'phone',
        label: 'Recipient Phone',
        type: 'tel',
        required: true,
        placeholder: '08012345678'
      }
    ]
  },
  {
    id: 'airtime-cash',
    name: 'Airtime to Cash',
    category: 'finance',
    description: 'Convert excess airtime into real cash with instant wallet credit or bank payout',
    icon: 'RefreshCw',
    enabled: true,
    customerVisible: true,
    provider: 'INTERNAL',
    pricingType: 'percentage',
    minAmount: 1000,
    maxAmount: 100000,
    fields: [
      {
        name: 'network',
        label: 'Network',
        type: 'select',
        required: true,
        options: [
          { label: 'MTN (82% Payout)', value: 'MTN' },
          { label: 'Airtel (80% Payout)', value: 'AIRTEL' },
          { label: 'Glo (75% Payout)', value: 'GLO' },
          { label: '9mobile (70% Payout)', value: '9MOBILE' }
        ]
      },
      {
        name: 'senderPhone',
        label: 'Sender Phone (SIM transferring airtime)',
        type: 'tel',
        required: true,
        placeholder: 'e.g. 08012345678'
      },
      {
        name: 'airtimeAmount',
        label: 'Airtime Amount (₦)',
        type: 'number',
        required: true,
        placeholder: 'Min ₦1,000 - Max ₦100,000'
      },
      {
        name: 'payoutDestination',
        label: 'Payout Method',
        type: 'select',
        required: true,
        options: [
          { label: 'Mash DataSub Wallet (Instant upon approval)', value: 'WALLET' },
          { label: 'Bank Account Transfer', value: 'BANK' }
        ]
      }
    ]
  }
];

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  registrationEnabled: true,
  transferEnabled: true,
  customerToCustomerTransferEnabled: true,
  transferFeeType: 'flat',
  transferFixedFee: 50, // Default ₦50 transfer fee
  transferPercentFee: 0,
  transferFeePayer: 'SENDER', // 'SENDER' or 'RECIPIENT'
  minTransferAmount: 50,
  maxTransferAmount: 200000,
  dailyTransferLimit: 500000,
  transferCharge: 50, // Default ₦50 transfer fee
  generalTransactionChargePercent: 0,
  servicesAvailability: {
    data: true,
    airtime: true,
    electricity: true,
    tv: true,
    examPin: true,
    airtimeToCash: true,
    transfer: true
  },
  airtimePricing: {
    customerDiscountPercent: 2, // 2% discount (user pays ₦98 for ₦100)
    serviceFee: 0,
    generalTransactionChargePercent: 0
  },
  serviceCharges: {
    electricityFee: 100, // standard convenience fee in NGN
    tvFee: 100,
    waecPrice: 3800,
    necoPrice: 1500,
    nabtebPrice: 1600
  },
  electricityProviders: [
    { id: 'IKEDC', name: 'Ikeja Electric (IKEDC)', enabled: true, fee: 100, outageStatus: false },
    { id: 'EKEDC', name: 'Eko Electric (EKEDC)', enabled: true, fee: 100, outageStatus: false },
    { id: 'AEDC', name: 'Abuja Electricity (AEDC)', enabled: true, fee: 100, outageStatus: false },
    { id: 'IBEDC', name: 'Ibadan Electricity (IBEDC)', enabled: true, fee: 100, outageStatus: false },
    { id: 'PHED', name: 'Port Harcourt Electric (PHED)', enabled: true, fee: 100, outageStatus: false },
    { id: 'JED', name: 'Jos Electricity (JED)', enabled: true, fee: 100, outageStatus: false },
    { id: 'KAEDCO', name: 'Kaduna Electric (KAEDCO)', enabled: true, fee: 100, outageStatus: false },
    { id: 'KEDCO', name: 'Kano Electricity (KEDCO)', enabled: true, fee: 100, outageStatus: false },
    { id: 'EEDC', name: 'Enugu Electricity (EEDC)', enabled: true, fee: 100, outageStatus: false }
  ],
  tvProviders: [
    {
      id: 'DSTV',
      name: 'DStv',
      enabled: true,
      fee: 100,
      packages: [
        { id: 'dstv-padi', name: 'DStv Padi', price: 4400, enabled: true },
        { id: 'dstv-yanga', name: 'DStv Yanga', price: 6000, enabled: true },
        { id: 'dstv-confam', name: 'DStv Confam', price: 10500, enabled: true },
        { id: 'dstv-compact', name: 'DStv Compact', price: 19000, enabled: true },
        { id: 'dstv-compact-plus', name: 'DStv Compact Plus', price: 30000, enabled: true },
        { id: 'dstv-premium', name: 'DStv Premium', price: 44000, enabled: true }
      ]
    },
    {
      id: 'GOTV',
      name: 'GOtv',
      enabled: true,
      fee: 100,
      packages: [
        { id: 'gotv-smallie', name: 'GOtv Smallie', price: 1900, enabled: true },
        { id: 'gotv-jinja', name: 'GOtv Jinja', price: 3900, enabled: true },
        { id: 'gotv-jolli', name: 'GOtv Jolli', price: 5800, enabled: true },
        { id: 'gotv-max', name: 'GOtv Max', price: 8500, enabled: true },
        { id: 'gotv-supa', name: 'GOtv Supa', price: 11400, enabled: true },
        { id: 'gotv-supa-plus', name: 'GOtv Supa Plus', price: 16800, enabled: true }
      ]
    },
    {
      id: 'STARTIMES',
      name: 'StarTimes',
      enabled: true,
      fee: 100,
      packages: [
        { id: 'startimes-nova', name: 'StarTimes Nova', price: 1900, enabled: true },
        { id: 'startimes-basic', name: 'StarTimes Basic', price: 3700, enabled: true },
        { id: 'startimes-smart', name: 'StarTimes Smart', price: 4200, enabled: true },
        { id: 'startimes-classic', name: 'StarTimes Classic', price: 5500, enabled: true },
        { id: 'startimes-super', name: 'StarTimes Super', price: 8200, enabled: true }
      ]
    }
  ],
  examPinProducts: [
    { id: 'WAEC', name: 'WAEC Result Checker', enabled: true, sellingPrice: 3800 },
    { id: 'NECO', name: 'NECO Result Checker', enabled: true, sellingPrice: 1500 },
    { id: 'NABTEB', name: 'NABTEB Result Checker', enabled: true, sellingPrice: 1600 }
  ],
  airtimeCashRates: {
    MTN: 0.82, // 82% cash payout
    AIRTEL: 0.80,
    GLO: 0.75,
    '9MOBILE': 0.70
  },
  airtimeCashAdminPhone: '08081419276',
  airtimeCashSettings: {
    enabled: true,
    rates: {
      MTN: 0.82,
      AIRTEL: 0.80,
      GLO: 0.75,
      '9MOBILE': 0.70
    },
    recipientPhones: {
      MTN: '08081419276',
      AIRTEL: '08081419276',
      GLO: '08081419276',
      '9MOBILE': '08081419276'
    },
    transferCodes: {
      MTN: '*321*1*RecipientPhone*Amount*PIN#',
      AIRTEL: '*432*1*RecipientPhone*Amount*PIN#',
      GLO: '*131*RecipientPhone*Amount*PIN#',
      '9MOBILE': '*223*PIN*Amount*RecipientPhone#'
    },
    minAmount: 1000,
    maxAmount: 100000,
    fee: 0,
    payoutWorkflow: 'WALLET',
    requireAdminApproval: true,
    instructions: 'Transfer the specified airtime amount using the transfer code for your network to our designated merchant SIM number. Once sent, click Submit. Your wallet will be credited once the admin confirms receipt.'
  },
  paymentGatewayConfig: {
    activeProvider: 'PAYSTACK',
    backupProvider: 'NONE',
    environment: 'test',
    virtualAccountsEnabled: true,
    providers: {
      paystack: {
        enabled: true,
        mode: (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_' + 'live') ? 'live' : 'test'),
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
        secretKey: process.env.PAYSTACK_SECRET_KEY || '',
        virtualAccountsEnabled: true
      },
      squad: {
        enabled: false,
        mode: 'live',
        publicKey: process.env.SQUAD_PUBLIC_KEY || '',
        secretKey: process.env.SQUAD_SECRET_KEY || '',
        apiKey: process.env.SQUAD_API_KEY || '',
        baseUrl: process.env.SQUAD_BASE_URL || 'https://api.squadco.com',
        merchantId: process.env.SQUAD_MERCHANT_ID || '',
        virtualAccountsEnabled: false
      },
      monnify: {
        enabled: false,
        mode: 'live',
        apiKey: process.env.MONNIFY_API_KEY || '',
        secretKey: process.env.MONNIFY_SECRET_KEY || '',
        contractCode: process.env.MONNIFY_CONTRACT_CODE || '',
        baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
        virtualAccountsEnabled: false
      }
    }
  },
  paymentGateways: {
    paystack: {
      enabled: true,
      mode: (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_' + 'live') ? 'live' : 'test'),
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
      secretKey: process.env.PAYSTACK_SECRET_KEY || ''
    },
    flutterwave: {
      enabled: true,
      mode: (process.env.FLUTTERWAVE_SECRET_KEY?.startsWith('FLWSECK_TEST') ? 'test' : 'live'),
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
      secretHash: process.env.FLUTTERWAVE_SECRET_HASH || '',
      encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || ''
    },
    monnify: {
      enabled: false, // Disabled by default until real credentials provided
      mode: 'sandbox',
      apiKey: '',
      secretKey: '',
      contractCode: ''
    }
  },
  vtuProvider: {
    providerName: 'RAPIDBILLS',
    enabled: !!process.env.VTU_PROVIDER_API_KEY,
    mode: 'live',
    apiKey: process.env.VTU_PROVIDER_API_KEY || '',
    userId: process.env.VTU_PROVIDER_USER_ID || '',
    apiUrl: process.env.VTU_PROVIDER_URL || 'https://www.rapidbills.ng/api/reseller/v1'
  },
  emailConfig: {
    configured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    gmailUser: process.env.GMAIL_USER || '',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
    fromName: 'Mash DataSub'
  }
};

class Database {
  private data: DatabaseSchema;
  private isWriting: boolean = false;

  constructor() {
    this.ensureDataDir();
    this.data = this.load();
    this.seedOwner();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Merge loaded data plans with any missing DEFAULT_DATA_PLANS
        const existingPlans: DataPlan[] = parsed.dataPlans || [];
        const existingPlanIds = new Set(existingPlans.map(p => p.id));
        const mergedPlans = [...existingPlans];
        for (const defaultPlan of DEFAULT_DATA_PLANS) {
          if (!existingPlanIds.has(defaultPlan.id)) {
            mergedPlans.push(defaultPlan);
          }
        }

        // Deeply merge settings
        const parsedSettings = parsed.settings || {};
        const mergedSettings: SystemSettings = {
          ...DEFAULT_SETTINGS,
          ...parsedSettings,
          servicesAvailability: {
            ...DEFAULT_SETTINGS.servicesAvailability,
            ...(parsedSettings.servicesAvailability || {})
          },
          serviceCharges: {
            ...DEFAULT_SETTINGS.serviceCharges,
            ...(parsedSettings.serviceCharges || {})
          },
          airtimePricing: {
            ...DEFAULT_SETTINGS.airtimePricing,
            ...(parsedSettings.airtimePricing || {})
          },
          electricityProviders: parsedSettings.electricityProviders && parsedSettings.electricityProviders.length > 0
            ? parsedSettings.electricityProviders
            : DEFAULT_SETTINGS.electricityProviders,
          tvProviders: parsedSettings.tvProviders && parsedSettings.tvProviders.length > 0
            ? parsedSettings.tvProviders
            : DEFAULT_SETTINGS.tvProviders,
          examPinProducts: parsedSettings.examPinProducts && parsedSettings.examPinProducts.length > 0
            ? parsedSettings.examPinProducts
            : DEFAULT_SETTINGS.examPinProducts,
          airtimeCashRates: {
            ...DEFAULT_SETTINGS.airtimeCashRates,
            ...(parsedSettings.airtimeCashRates || {})
          },
          paymentGatewayConfig: {
            ...DEFAULT_SETTINGS.paymentGatewayConfig,
            ...(parsedSettings.paymentGatewayConfig || {}),
            providers: {
              paystack: {
                ...DEFAULT_SETTINGS.paymentGatewayConfig.providers.paystack,
                ...(parsedSettings.paymentGatewayConfig?.providers?.paystack || {})
              },
              pocketapp: {
                ...DEFAULT_SETTINGS.paymentGatewayConfig.providers.pocketapp,
                ...(parsedSettings.paymentGatewayConfig?.providers?.pocketapp || {})
              },
              squad: {
                ...DEFAULT_SETTINGS.paymentGatewayConfig.providers.squad,
                ...(parsedSettings.paymentGatewayConfig?.providers?.squad || {})
              },
              flutterwave: {
                ...DEFAULT_SETTINGS.paymentGatewayConfig.providers.flutterwave,
                ...(parsedSettings.paymentGatewayConfig?.providers?.flutterwave || {})
              }
            }
          },
          paymentGateways: {
            paystack: {
              ...DEFAULT_SETTINGS.paymentGateways.paystack,
              ...(parsedSettings.paymentGateways?.paystack || {})
            },
            flutterwave: {
              ...DEFAULT_SETTINGS.paymentGateways.flutterwave,
              ...(parsedSettings.paymentGateways?.flutterwave || {})
            },
            monnify: {
              ...DEFAULT_SETTINGS.paymentGateways.monnify,
              ...(parsedSettings.paymentGateways?.monnify || {})
            }
          },
          vtuProvider: {
            ...DEFAULT_SETTINGS.vtuProvider,
            ...(parsedSettings.vtuProvider || {})
          },
          emailConfig: {
            ...DEFAULT_SETTINGS.emailConfig,
            ...(parsedSettings.emailConfig || {})
          },
          airtimeCashSettings: {
            ...DEFAULT_SETTINGS.airtimeCashSettings,
            ...(parsedSettings.airtimeCashSettings || {})
          }
        };

        return {
          users: parsed.users || [],
          otps: parsed.otps || [],
          dataPlans: mergedPlans,
          transactions: parsed.transactions || [],
          settings: mergedSettings,
          auditLogs: parsed.auditLogs || [],
          dedicatedVirtualAccounts: parsed.dedicatedVirtualAccounts || [],
          paymentTransactions: parsed.paymentTransactions || [],
          webhookEvents: parsed.webhookEvents || [],
          airtimeCashRequests: parsed.airtimeCashRequests || [],
          dynamicServices: (parsed.dynamicServices && parsed.dynamicServices.length > 0) ? parsed.dynamicServices : DEFAULT_DYNAMIC_SERVICES
        };
      }
    } catch (err) {
      console.error('Error loading database file, initializing defaults:', err);
    }

    const initial: DatabaseSchema = {
      users: [],
      otps: [],
      dataPlans: DEFAULT_DATA_PLANS,
      transactions: [],
      settings: DEFAULT_SETTINGS,
      auditLogs: [],
      dedicatedVirtualAccounts: [],
      paymentTransactions: [],
      webhookEvents: [],
      airtimeCashRequests: [],
      dynamicServices: DEFAULT_DYNAMIC_SERVICES
    };
    this.saveImmediate(initial);
    return initial;
  }

  private saveImmediate(data: DatabaseSchema) {
    try {
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  public save() {
    if (this.isWriting) return;
    this.isWriting = true;
    try {
      this.saveImmediate(this.data);
    } finally {
      this.isWriting = false;
    }
  }

  // Hash password with salt
  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  public verifyPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const computed = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
    } catch {
      return false;
    }
  }

  // Hash Transaction PIN (4 digits)
  public hashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
    return `${salt}:${hash}`;
  }

  public verifyPin(pin: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const computed = crypto.scryptSync(pin, salt, 32).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
    } catch {
      return false;
    }
  }

  // Ensure owner account exists
  private seedOwner() {
    const configuredOwner = process.env.OWNER_EMAIL?.toLowerCase().trim();
    const defaultOwnerPass = process.env.OWNER_INITIAL_PASSWORD?.trim();
    const defaultOwnerPin = process.env.OWNER_INITIAL_TRANSACTION_PIN?.trim();

    if (!configuredOwner || !defaultOwnerPass || !defaultOwnerPin) {
      throw new Error('OWNER_EMAIL, OWNER_INITIAL_PASSWORD, and OWNER_INITIAL_TRANSACTION_PIN are required. Configure them in the hosting environment before starting Mash DataSub.');
    }

    const ownerEmails = [configuredOwner];

    for (const email of ownerEmails) {
      let owner = this.data.users.find(u => u.email.toLowerCase() === email);
      if (!owner) {
        owner = {
          id: 'owner_' + crypto.randomUUID(),
          fullName: 'Mash DataSub Owner',
          email: email,
          phone: process.env.OWNER_PHONE || '',
          passwordHash: this.hashPassword(defaultOwnerPass),
          role: 'OWNER',
          isVerified: true,
          walletBalance: 0.00,
          transactionPinHash: this.hashPin(defaultOwnerPin),
          referralCode: 'MASHKUR01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.data.users.push(owner);
        this.data.auditLogs.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actorEmail: email,
          action: 'SEED_OWNER',
          details: 'Initial owner account seeded for ' + email
        });
      } else {
        if (owner.role !== 'OWNER') {
          owner.role = 'OWNER';
          owner.isVerified = true;
        }
      }
    }
    this.save();
  }

  // Users
  public getUsers(): User[] {
    return this.data.users;
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public getUserById(id: string): User | undefined {
    return this.findUserById(id);
  }

  public findUserByEmailOrPhone(identifier: string): User | undefined {
    const clean = identifier.toLowerCase().trim();
    return this.data.users.find(u => u.email.toLowerCase() === clean || u.phone.trim() === identifier.trim());
  }

  public getUserByEmail(email: string): User | undefined {
    return this.findUserByEmailOrPhone(email);
  }

  public findUserByIdentifier(identifier: string): User | undefined {
    if (!identifier) return undefined;
    const clean = identifier.trim().toLowerCase();
    return this.data.users.find(u =>
      u.id.toLowerCase() === clean ||
      u.email.toLowerCase() === clean ||
      u.phone.trim() === identifier.trim() ||
      (u.referralCode && u.referralCode.toLowerCase() === clean)
    );
  }

  public updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): User | null {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    user.status = status;
    user.updatedAt = new Date().toISOString();
    this.save();
    return user;
  }

  // User-to-User Atomic Wallet Transfer
  public atomicUserTransfer(
    senderId: string,
    recipientIdentifier: string,
    transferAmount: number,
    explicitFee?: number,
    options?: {
      feePayer?: 'SENDER' | 'RECIPIENT';
      skipLimitCheck?: boolean;
    }
  ): {
    success: boolean;
    error?: string;
    senderTx?: Transaction;
    recipientTx?: Transaction;
    senderNewBalance?: number;
    recipientUser?: User;
    fee?: number;
    feePayer?: 'SENDER' | 'RECIPIENT';
    recipientReceived?: number;
    totalDeducted?: number;
  } {
    const settings = this.data.settings;

    // 1. Check system transfer settings
    if (settings.maintenanceMode) {
      return { success: false, error: 'System is temporarily in maintenance mode.' };
    }

    if (settings.transferEnabled === false || settings.customerToCustomerTransferEnabled === false) {
      return { success: false, error: 'Customer-to-customer wallet transfers are currently disabled by the administrator.' };
    }

    const amount = Math.round(transferAmount * 100) / 100;
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Transfer amount must be greater than zero.' };
    }

    // 2. Minimum transfer amount check
    const minAmount = settings.minTransferAmount !== undefined ? settings.minTransferAmount : 10;
    if (amount < minAmount) {
      return { success: false, error: `Minimum transfer amount is ₦${minAmount.toLocaleString()}.` };
    }

    // 3. Maximum per-transfer amount check
    const maxAmount = settings.maxTransferAmount || 500000;
    if (maxAmount > 0 && amount > maxAmount) {
      return { success: false, error: `Maximum transfer amount per transaction is ₦${maxAmount.toLocaleString()}.` };
    }

    // 4. Sender validation
    const sender = this.data.users.find(u => u.id === senderId);
    if (!sender) {
      return { success: false, error: 'Sender account not found.' };
    }
    if (sender.status === 'SUSPENDED') {
      return { success: false, error: 'Your account has been suspended. Outgoing transfers are restricted.' };
    }

    // 5. Daily transfer limit check
    const dailyLimit = settings.dailyTransferLimit || 500000;
    if (dailyLimit > 0 && !options?.skipLimitCheck) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayTransfers = this.data.transactions.filter(t =>
        t.userId === sender.id &&
        t.service === 'TRANSFER_OUT' &&
        t.status === 'Successful' &&
        new Date(t.createdAt).getTime() >= startOfDay
      );
      const todayTotal = todayTransfers.reduce((sum, t) => sum + ((t.metadata?.transferAmount as number) || t.amount), 0);
      if (todayTotal + amount > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - todayTotal);
        return {
          success: false,
          error: `Daily transfer limit of ₦${dailyLimit.toLocaleString()} reached. You have transferred ₦${todayTotal.toLocaleString()} today. Remaining limit today: ₦${remaining.toLocaleString()}.`
        };
      }
    }

    // 6. Recipient validation
    const recipient = this.findUserByIdentifier(recipientIdentifier);
    if (!recipient) {
      return { success: false, error: 'Recipient account not found on Mash DataSub. Please check the email or phone number.' };
    }

    if (recipient.id === sender.id) {
      return { success: false, error: 'You cannot transfer money to your own wallet account.' };
    }

    if (recipient.status === 'SUSPENDED') {
      return { success: false, error: 'Recipient account is suspended and cannot receive transfers.' };
    }

    // 7. Calculate Fee
    let fee = 0;
    if (explicitFee !== undefined) {
      fee = Math.max(0, Math.round(explicitFee * 100) / 100);
    } else {
      const feeType = settings.transferFeeType || 'flat';
      if (feeType === 'free') {
        fee = 0;
      } else if (feeType === 'percentage') {
        const pct = settings.transferPercentFee !== undefined ? settings.transferPercentFee : 1;
        fee = Math.round((amount * (pct / 100)) * 100) / 100;
      } else {
        // Flat fee
        fee = Math.round((settings.transferFixedFee ?? settings.transferCharge ?? 50) * 100) / 100;
      }
    }

    // 8. Fee Payer Logic:
    // Option A: SENDER pays fee => Sender pays (amount + fee), Recipient receives amount.
    // Option B: RECIPIENT pays fee => Sender pays amount, Recipient receives (amount - fee).
    const feePayer: 'SENDER' | 'RECIPIENT' = options?.feePayer || settings.transferFeePayer || 'SENDER';

    let totalDeductionFromSender = 0;
    let recipientCreditAmount = 0;

    if (feePayer === 'SENDER') {
      totalDeductionFromSender = Math.round((amount + fee) * 100) / 100;
      recipientCreditAmount = amount;
    } else {
      // RECIPIENT pays fee
      if (fee >= amount) {
        return {
          success: false,
          error: `Transfer amount (₦${amount.toLocaleString()}) must be greater than the transfer fee of ₦${fee.toLocaleString()} when the fee is deducted from recipient.`
        };
      }
      totalDeductionFromSender = amount;
      recipientCreditAmount = Math.round((amount - fee) * 100) / 100;
    }

    // 9. Sender balance check
    const senderPrevBal = Math.round((sender.walletBalance || 0) * 100) / 100;
    if (senderPrevBal < totalDeductionFromSender) {
      return {
        success: false,
        error: `Insufficient wallet balance. Total required: ₦${totalDeductionFromSender.toLocaleString()} (${feePayer === 'SENDER' ? `Transfer: ₦${amount.toLocaleString()} + Fee: ₦${fee.toLocaleString()}` : `Transfer: ₦${amount.toLocaleString()}`}), but your balance is ₦${senderPrevBal.toLocaleString()}.`
      };
    }

    // 10. Atomic balance calculations
    const senderNewBal = Math.round((senderPrevBal - totalDeductionFromSender) * 100) / 100;
    const recipientPrevBal = Math.round((recipient.walletBalance || 0) * 100) / 100;
    const recipientNewBal = Math.round((recipientPrevBal + recipientCreditAmount) * 100) / 100;

    // Apply atomic wallet balances
    sender.walletBalance = senderNewBal;
    sender.updatedAt = new Date().toISOString();

    recipient.walletBalance = recipientNewBal;
    recipient.updatedAt = new Date().toISOString();

    const timestamp = Date.now();
    const reference = 'MDS-TRF-' + timestamp + '-' + Math.floor(1000 + Math.random() * 9000);

    // Create Sender Transaction (TRANSFER_OUT)
    const senderTx: Transaction = {
      id: 'tx_' + crypto.randomUUID(),
      reference,
      userId: sender.id,
      userEmail: sender.email,
      userName: sender.fullName,
      service: 'TRANSFER_OUT',
      description: `Transfer of ₦${amount.toLocaleString()} to ${recipient.fullName} (${recipient.phone || recipient.email})${fee > 0 ? (feePayer === 'SENDER' ? ` [₦${fee} fee charged]` : ' [fee paid by recipient]') : ''}`,
      amount: totalDeductionFromSender,
      previousBalance: senderPrevBal,
      newBalance: senderNewBal,
      status: 'Successful',
      metadata: {
        transferAmount: amount,
        fee,
        feePayer,
        totalDeducted: totalDeductionFromSender,
        recipientReceived: recipientCreditAmount,
        recipientId: recipient.id,
        recipientName: recipient.fullName,
        recipientEmail: recipient.email,
        recipientPhone: recipient.phone
      },
      createdAt: new Date().toISOString()
    };
    this.data.transactions.unshift(senderTx);

    // Create Recipient Transaction (TRANSFER_IN)
    const recipientTx: Transaction = {
      id: 'tx_' + crypto.randomUUID(),
      reference: reference + '-IN',
      userId: recipient.id,
      userEmail: recipient.email,
      userName: recipient.fullName,
      service: 'TRANSFER_IN',
      description: `Transfer of ₦${amount.toLocaleString()} received from ${sender.fullName} (${sender.phone || sender.email})${fee > 0 && feePayer === 'RECIPIENT' ? ` [₦${fee} fee deducted, net ₦${recipientCreditAmount.toLocaleString()}]` : ''}`,
      amount: recipientCreditAmount,
      previousBalance: recipientPrevBal,
      newBalance: recipientNewBal,
      status: 'Successful',
      metadata: {
        transferAmount: amount,
        feeDeducted: feePayer === 'RECIPIENT' ? fee : 0,
        feePayer,
        netReceived: recipientCreditAmount,
        senderId: sender.id,
        senderName: sender.fullName,
        senderEmail: sender.email,
        senderPhone: sender.phone,
        originalReference: reference
      },
      createdAt: new Date().toISOString()
    };
    this.data.transactions.unshift(recipientTx);

    this.save();

    return {
      success: true,
      senderTx,
      recipientTx,
      senderNewBalance: senderNewBal,
      recipientUser: recipient,
      fee,
      feePayer,
      recipientReceived: recipientCreditAmount,
      totalDeducted: totalDeductionFromSender
    };
  }

  public createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const now = new Date().toISOString();
    const newUser: User = {
      ...user,
      id: 'usr_' + crypto.randomUUID(),
      walletBalance: 0.00, // Newly registered customer starts with ₦0.00 (Rule 15)
      createdAt: now,
      updatedAt: now
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.users[idx];
  }

  // Atomic Wallet Operations (Rule 39)
  public atomicUpdateBalance(userId: string, deltaAmount: number): { success: boolean; newBalance: number; previousBalance: number; error?: string } {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, newBalance: 0, previousBalance: 0, error: 'User not found' };

    const previousBalance = Math.round((user.walletBalance || 0) * 100) / 100;
    const newBalance = Math.round((previousBalance + deltaAmount) * 100) / 100;

    if (newBalance < 0) {
      return { success: false, newBalance: previousBalance, previousBalance, error: 'Insufficient wallet balance' };
    }

    user.walletBalance = newBalance;
    user.updatedAt = new Date().toISOString();
    this.save();

    return { success: true, newBalance, previousBalance };
  }

  // OTPs
  public saveOtp(identifier: string, code: string, type: 'registration' | 'forgot_password'): OtpRecord {
    // Invalidate previous active OTPs for this identifier and type
    const now = Date.now();
    this.data.otps.forEach(o => {
      if (o.identifier.toLowerCase() === identifier.toLowerCase() && o.type === type && !o.used) {
        o.used = true;
      }
    });

    const otp: OtpRecord = {
      id: crypto.randomUUID(),
      identifier: identifier.toLowerCase().trim(),
      code,
      type,
      expiresAt: now + 10 * 60 * 1000, // 10 minutes expiry
      used: false,
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    this.data.otps.push(otp);
    this.save();
    return otp;
  }

  public verifyOtp(identifier: string, code: string, type: 'registration' | 'forgot_password'): { valid: boolean; error?: string } {
    const now = Date.now();
    const record = this.data.otps
      .filter(o => o.identifier.toLowerCase() === identifier.toLowerCase().trim() && o.type === type && !o.used)
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];

    if (!record) {
      return { valid: false, error: 'No active OTP found. Please request a new OTP.' };
    }

    if (record.expiresAt < now) {
      record.used = true;
      this.save();
      return { valid: false, error: 'OTP has expired. Please request a new one.' };
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      record.used = true;
      this.save();
      return { valid: false, error: 'Too many failed OTP attempts. Please request a new OTP.' };
    }

    if (record.code.trim() !== code.trim()) {
      this.save();
      return { valid: false, error: 'Incorrect OTP. Please check the code and try again.' };
    }

    record.used = true;
    this.save();
    return { valid: true };
  }

  // Data Plans (Admin Price Control - Rule 13 & 37)
  public getDataPlans(onlyActive: boolean = false): DataPlan[] {
    if (onlyActive) {
      return this.data.dataPlans.filter(p => p.isAvailable);
    }
    return this.data.dataPlans;
  }

  public findDataPlanById(id: string): DataPlan | undefined {
    return this.data.dataPlans.find(p => p.id === id);
  }

  public updateDataPlanPrice(id: string, newPrice: number): boolean {
    const plan = this.data.dataPlans.find(p => p.id === id);
    if (!plan) return false;
    plan.sellingPrice = newPrice;
    this.save();
    return true;
  }

  public updateDataPlan(id: string, updates: Partial<DataPlan>): boolean {
    const idx = this.data.dataPlans.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.data.dataPlans[idx] = { ...this.data.dataPlans[idx], ...updates };
    this.save();
    return true;
  }

  public addDataPlan(plan: DataPlan): void {
    this.data.dataPlans.push(plan);
    this.save();
  }

  public deleteDataPlan(id: string): boolean {
    const idx = this.data.dataPlans.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.data.dataPlans.splice(idx, 1);
    this.save();
    return true;
  }

  public setDataPlans(plans: DataPlan[]): void {
    this.data.dataPlans = plans;
    this.save();
  }

  // Transactions
  public getTransactions(userId?: string): Transaction[] {
    if (userId) {
      return this.data.transactions.filter(t => t.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return this.data.transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public findTransactionByReference(ref: string): Transaction | undefined {
    return this.data.transactions.find(t => t.reference === ref);
  }

  public createTransaction(tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const newTx: Transaction = {
      ...tx,
      id: 'tx_' + crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.data.transactions.unshift(newTx);
    this.save();
    return newTx;
  }

  public updateTransactionStatus(reference: string, status: Transaction['status'], providerResponse?: string): Transaction | undefined {
    const tx = this.data.transactions.find(t => t.reference === reference);
    if (!tx) return undefined;
    tx.status = status;
    if (providerResponse) tx.providerResponse = providerResponse;
    this.save();
    return tx;
  }

  // Settings
  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public updateSettings(updates: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }

  // Audit Logs
  public addAuditLog(actorEmail: string, action: string, details: string) {
    this.data.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorEmail,
      action,
      details
    });
    // Keep max 500 logs
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs.pop();
    }
    this.save();
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // Dedicated Virtual Accounts (Paystack & Flutterwave DVA)
  public getDedicatedVirtualAccounts(): DedicatedVirtualAccount[] {
    return (this.data.dedicatedVirtualAccounts || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getDedicatedVirtualAccountsByUserId(userId: string): DedicatedVirtualAccount[] {
    return (this.data.dedicatedVirtualAccounts || []).filter(d => d.userId === userId);
  }

  public getDedicatedVirtualAccountByUserId(userId: string): DedicatedVirtualAccount | undefined {
    const list = this.getDedicatedVirtualAccountsByUserId(userId);
    // Prefer active account, otherwise first available
    return list.find(d => d.status === 'ACTIVE') || list[0];
  }

  public getDedicatedVirtualAccount(userId: string): DedicatedVirtualAccount | undefined {
    return this.getDedicatedVirtualAccountByUserId(userId);
  }

  public findDedicatedVirtualAccountByUserId(userId: string): DedicatedVirtualAccount | undefined {
    return this.getDedicatedVirtualAccountByUserId(userId);
  }

  public getDedicatedVirtualAccountByUserIdAndProvider(userId: string, provider: 'PAYSTACK' | 'FLUTTERWAVE'): DedicatedVirtualAccount | undefined {
    return (this.data.dedicatedVirtualAccounts || []).find(d => d.userId === userId && d.provider === provider);
  }

  public getDedicatedVirtualAccountByAccountNumber(accountNumber: string): DedicatedVirtualAccount | undefined {
    if (!accountNumber) return undefined;
    const clean = accountNumber.trim();
    return (this.data.dedicatedVirtualAccounts || []).find(d => d.accountNumber && d.accountNumber.trim() === clean);
  }

  public getDedicatedVirtualAccountByCustomerCode(customerCode: string): DedicatedVirtualAccount | undefined {
    if (!customerCode) return undefined;
    const clean = customerCode.trim().toLowerCase();
    return (this.data.dedicatedVirtualAccounts || []).find(d => d.customerCode && d.customerCode.trim().toLowerCase() === clean);
  }

  public getDedicatedVirtualAccountByOrderRef(orderRef: string): DedicatedVirtualAccount | undefined {
    if (!orderRef) return undefined;
    const clean = orderRef.trim().toLowerCase();
    return (this.data.dedicatedVirtualAccounts || []).find(d => d.orderRef && d.orderRef.trim().toLowerCase() === clean);
  }

  public getDedicatedVirtualAccountByFlwRef(flwRef: string): DedicatedVirtualAccount | undefined {
    if (!flwRef) return undefined;
    const clean = flwRef.trim().toLowerCase();
    return (this.data.dedicatedVirtualAccounts || []).find(d => d.flwRef && d.flwRef.trim().toLowerCase() === clean);
  }

  public saveDedicatedVirtualAccount(dva: DedicatedVirtualAccount): DedicatedVirtualAccount {
    this.data.dedicatedVirtualAccounts = this.data.dedicatedVirtualAccounts || [];
    const idx = this.data.dedicatedVirtualAccounts.findIndex(
      d => d.id === dva.id || (d.userId === dva.userId && d.provider === dva.provider)
    );
    if (idx >= 0) {
      this.data.dedicatedVirtualAccounts[idx] = {
        ...this.data.dedicatedVirtualAccounts[idx],
        ...dva,
        updatedAt: new Date().toISOString()
      };
      this.save();
      return this.data.dedicatedVirtualAccounts[idx];
    } else {
      this.data.dedicatedVirtualAccounts.push(dva);
      this.save();
      return dva;
    }
  }

  public updateDedicatedVirtualAccount(id: string, updates: Partial<DedicatedVirtualAccount>): DedicatedVirtualAccount | undefined {
    this.data.dedicatedVirtualAccounts = this.data.dedicatedVirtualAccounts || [];
    const dva = this.data.dedicatedVirtualAccounts.find(d => d.id === id || d.userId === id);
    if (!dva) return undefined;
    Object.assign(dva, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return dva;
  }

  public recordDvaFunding(accountNumber: string, amount: number, reference: string): void {
    const dva = this.getDedicatedVirtualAccountByAccountNumber(accountNumber);
    if (dva) {
      dva.totalReceived = (dva.totalReceived || 0) + amount;
      dva.lastFundingAt = new Date().toISOString();
      dva.lastFundingReference = reference;
      dva.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  // ==================== PAYMENT TRANSACTIONS & AUDIT ====================
  public getPaymentTransactions(userId?: string): PaymentTransaction[] {
    const txs = this.data.paymentTransactions || [];
    if (userId) {
      return txs.filter(t => t.customerId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return [...txs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public findPaymentTransactionByReference(reference: string): PaymentTransaction | undefined {
    if (!reference) return undefined;
    const clean = reference.trim().toLowerCase();
    return (this.data.paymentTransactions || []).find(
      t => (t.reference && t.reference.trim().toLowerCase() === clean) ||
           (t.providerTransactionId && t.providerTransactionId.trim().toLowerCase() === clean)
    );
  }

  public findPaymentTransactionById(id: string): PaymentTransaction | undefined {
    if (!id) return undefined;
    return (this.data.paymentTransactions || []).find(t => t.id === id);
  }

  public findPaymentTransactionByProviderId(providerTransactionId: string): PaymentTransaction | undefined {
    if (!providerTransactionId) return undefined;
    const clean = providerTransactionId.trim().toLowerCase();
    return (this.data.paymentTransactions || []).find(
      t => t.providerTransactionId && t.providerTransactionId.trim().toLowerCase() === clean
    );
  }

  public createPaymentTransaction(tx: Omit<PaymentTransaction, 'id' | 'createdAt' | 'updatedAt'>): PaymentTransaction {
    this.data.paymentTransactions = this.data.paymentTransactions || [];
    const now = new Date().toISOString();
    const newTx: PaymentTransaction = {
      id: `ptx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      ...tx
    };
    this.data.paymentTransactions.push(newTx);
    this.save();
    return newTx;
  }

  public updatePaymentTransaction(idOrRef: string, updates: Partial<PaymentTransaction>): PaymentTransaction | undefined {
    this.data.paymentTransactions = this.data.paymentTransactions || [];
    const clean = idOrRef.trim().toLowerCase();
    const idx = this.data.paymentTransactions.findIndex(
      t => t.id === idOrRef ||
           (t.reference && t.reference.trim().toLowerCase() === clean) ||
           (t.providerTransactionId && t.providerTransactionId.trim().toLowerCase() === clean)
    );
    if (idx === -1) return undefined;

    this.data.paymentTransactions[idx] = {
      ...this.data.paymentTransactions[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.paymentTransactions[idx];
  }

  // ==================== WEBHOOK EVENTS ====================
  public recordWebhookEvent(event: Omit<WebhookEvent, 'id' | 'createdAt'>): WebhookEvent {
    this.data.webhookEvents = this.data.webhookEvents || [];
    const newEvent: WebhookEvent = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...event
    };
    this.data.webhookEvents.push(newEvent);
    // Keep last 1000 webhook events to avoid unbounded file growth
    if (this.data.webhookEvents.length > 1000) {
      this.data.webhookEvents = this.data.webhookEvents.slice(-1000);
    }
    this.save();
    return newEvent;
  }

  public getWebhookEvents(limit = 100): WebhookEvent[] {
    const events = this.data.webhookEvents || [];
    return [...events]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public isWebhookEventProcessed(provider: string, referenceOrId: string): boolean {
    if (!referenceOrId) return false;
    const clean = referenceOrId.trim().toLowerCase();
    const pClean = provider.trim().toLowerCase();
    return (this.data.webhookEvents || []).some(
      e => e.provider.trim().toLowerCase() === pClean &&
           e.processed &&
           ((e.reference && e.reference.trim().toLowerCase() === clean) ||
            (e.providerTransactionId && e.providerTransactionId.trim().toLowerCase() === clean))
    );
  }

  // ==================== PAYMENT GATEWAY CONFIG ====================
  public getPaymentGatewayConfig(): SystemSettings['paymentGatewayConfig'] {
    const config = this.data.settings.paymentGatewayConfig || DEFAULT_SETTINGS.paymentGatewayConfig;

    const envActive = (process.env.PAYMENT_PROVIDER as any) || config.activeProvider || 'PAYSTACK';
    const envBackup = (process.env.PAYMENT_BACKUP_PROVIDER as any) || config.backupProvider || 'NONE';
    const envEnv = ((process.env.PAYMENT_ENVIRONMENT || config.environment || 'test').toLowerCase() === 'live' ? 'live' : 'test') as 'test' | 'live';

    const paystackSecret = (process.env.PAYSTACK_SECRET_KEY || config.providers.paystack?.secretKey || '').trim();
    const paystackPublic = (process.env.PAYSTACK_PUBLIC_KEY || config.providers.paystack?.publicKey || '').trim();
    const paystackMode: 'test' | 'live' = (paystackSecret.startsWith('sk_' + 'live') || envEnv === 'live') ? 'live' : 'test';

    const monnifyKey = (process.env.MONNIFY_API_KEY || config.providers.monnify?.apiKey || '').trim();
    const monnifySecret = (process.env.MONNIFY_SECRET_KEY || config.providers.monnify?.secretKey || '').trim();
    const monnifyContract = (process.env.MONNIFY_CONTRACT_CODE || config.providers.monnify?.contractCode || '').trim();
    const monnifyUrl = (process.env.MONNIFY_BASE_URL || config.providers.monnify?.baseUrl || 'https://api.monnify.com').trim();
    const monnifyConfigured = Boolean(monnifyKey && monnifySecret && monnifyContract);

    const squadSecret = (process.env.SQUAD_SECRET_KEY || config.providers?.squad?.secretKey || '').trim();
    const squadPublic = (process.env.SQUAD_PUBLIC_KEY || config.providers?.squad?.publicKey || '').trim();
    const squadApiKey = (process.env.SQUAD_API_KEY || config.providers?.squad?.apiKey || '').trim();
    const squadUrl = (process.env.SQUAD_BASE_URL || config.providers?.squad?.baseUrl || (envEnv === 'live' ? 'https://api.squadco.com' : 'https://sandbox-api-d.squadco.com')).trim();
    const squadMerchantId = (process.env.SQUAD_MERCHANT_ID || config.providers?.squad?.merchantId || '').trim();
    const squadConfigured = Boolean(squadSecret || squadApiKey);

    return {
      activeProvider: envActive,
      backupProvider: envBackup,
      environment: envEnv,
      virtualAccountsEnabled: config.virtualAccountsEnabled ?? true,
      providers: {
        paystack: {
          enabled: config.providers.paystack?.enabled ?? true,
          mode: paystackMode,
          secretKey: paystackSecret,
          publicKey: paystackPublic,
          virtualAccountsEnabled: config.providers.paystack?.virtualAccountsEnabled ?? true
        },
        squad: {
          enabled: config.providers.squad?.enabled ?? squadConfigured,
          mode: envEnv,
          apiKey: squadApiKey,
          secretKey: squadSecret,
          publicKey: squadPublic,
          baseUrl: squadUrl,
          merchantId: squadMerchantId,
          virtualAccountsEnabled: false
        },
        monnify: {
          enabled: config.providers.monnify?.enabled ?? monnifyConfigured,
          mode: envEnv,
          apiKey: monnifyKey,
          secretKey: monnifySecret,
          contractCode: monnifyContract,
          baseUrl: monnifyUrl,
          virtualAccountsEnabled: false
        }
      }
    };
  }

  public updatePaymentGatewayConfig(updates: Partial<SystemSettings['paymentGatewayConfig']>): SystemSettings['paymentGatewayConfig'] {
    const current = this.data.settings.paymentGatewayConfig;
    const updated: SystemSettings['paymentGatewayConfig'] = {
      ...current,
      ...updates,
      providers: {
        paystack: {
          ...current.providers.paystack,
          ...(updates.providers?.paystack || {})
        },
        squad: {
          ...current.providers?.squad,
          ...(updates.providers?.squad || {})
        },
        monnify: {
          ...current.providers.monnify,
          ...(updates.providers?.monnify || {})
        }
      }
    };
    this.data.settings.paymentGatewayConfig = updated;

    // Keep legacy paymentGateways in sync for backward compatibility
    if (updated.providers.paystack) {
      this.data.settings.paymentGateways.paystack.enabled = updated.providers.paystack.enabled;
      this.data.settings.paymentGateways.paystack.mode = updated.providers.paystack.mode;
      this.data.settings.paymentGateways.paystack.publicKey = updated.providers.paystack.publicKey;
      this.data.settings.paymentGateways.paystack.secretKey = updated.providers.paystack.secretKey;
    }
    if (updated.providers.flutterwave) {
      this.data.settings.paymentGateways.flutterwave.enabled = updated.providers.flutterwave.enabled;
      this.data.settings.paymentGateways.flutterwave.mode = updated.providers.flutterwave.mode;
      this.data.settings.paymentGateways.flutterwave.publicKey = updated.providers.flutterwave.publicKey;
      this.data.settings.paymentGateways.flutterwave.secretKey = updated.providers.flutterwave.secretKey;
      this.data.settings.paymentGateways.flutterwave.secretHash = updated.providers.flutterwave.secretHash;
    }

    this.save();
    return updated;
  }

  // ==================== AIRTIME TO CASH ====================
  public getAirtimeCashRequests(filter?: { status?: string; userId?: string }): AirtimeCashRequest[] {
    const list = this.data.airtimeCashRequests || [];
    return list
      .filter(r => {
        if (filter?.status && filter.status !== 'ALL' && r.status !== filter.status) return false;
        if (filter?.userId && r.userId !== filter.userId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getAirtimeCashRequestById(id: string): AirtimeCashRequest | undefined {
    return (this.data.airtimeCashRequests || []).find(r => r.id === id || r.reference === id);
  }

  public createAirtimeCashRequest(req: Omit<AirtimeCashRequest, 'id' | 'createdAt' | 'updatedAt'>): AirtimeCashRequest {
    this.data.airtimeCashRequests = this.data.airtimeCashRequests || [];
    const now = new Date().toISOString();
    const newReq: AirtimeCashRequest = {
      id: `a2c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      ...req
    };
    this.data.airtimeCashRequests.unshift(newReq);
    this.save();
    return newReq;
  }

  public updateAirtimeCashRequest(id: string, updates: Partial<AirtimeCashRequest>): AirtimeCashRequest | undefined {
    this.data.airtimeCashRequests = this.data.airtimeCashRequests || [];
    const req = this.data.airtimeCashRequests.find(r => r.id === id || r.reference === id);
    if (!req) return undefined;
    Object.assign(req, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return req;
  }

  public getAirtimeCashSettings(): AirtimeCashSettings {
    const settings = this.data.settings.airtimeCashSettings || DEFAULT_SETTINGS.airtimeCashSettings!;
    return {
      ...settings,
      rates: {
        ...settings.rates,
        ...(this.data.settings.airtimeCashRates || {})
      }
    };
  }

  public updateAirtimeCashSettings(updates: Partial<AirtimeCashSettings>): AirtimeCashSettings {
    const current = this.getAirtimeCashSettings();
    const merged: AirtimeCashSettings = {
      ...current,
      ...updates,
      rates: {
        ...current.rates,
        ...(updates.rates || {})
      },
      recipientPhones: {
        ...current.recipientPhones,
        ...(updates.recipientPhones || {})
      },
      transferCodes: {
        ...current.transferCodes,
        ...(updates.transferCodes || {})
      }
    };
    this.data.settings.airtimeCashSettings = merged;
    if (updates.rates) {
      this.data.settings.airtimeCashRates = { ...merged.rates };
    }
    if (updates.recipientPhones?.MTN) {
      this.data.settings.airtimeCashAdminPhone = updates.recipientPhones.MTN;
    }
    this.save();
    return merged;
  }

  // ==================== DYNAMIC SERVICES ====================
  public getDynamicServices(): DynamicService[] {
    if (!this.data.dynamicServices || this.data.dynamicServices.length === 0) {
      this.data.dynamicServices = [...DEFAULT_DYNAMIC_SERVICES];
      this.save();
    }
    return this.data.dynamicServices;
  }

  public getDynamicServiceById(id: string): DynamicService | undefined {
    return this.getDynamicServices().find(s => s.id === id);
  }

  public createDynamicService(service: Omit<DynamicService, 'createdAt' | 'updatedAt'>): DynamicService {
    const services = this.getDynamicServices();
    const now = new Date().toISOString();
    const newService: DynamicService = {
      ...service,
      createdAt: now,
      updatedAt: now
    };
    services.push(newService);
    this.data.dynamicServices = services;
    this.save();
    return newService;
  }

  public updateDynamicService(id: string, updates: Partial<DynamicService>): DynamicService | undefined {
    const services = this.getDynamicServices();
    const service = services.find(s => s.id === id);
    if (!service) return undefined;
    Object.assign(service, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return service;
  }

  public deleteDynamicService(id: string): boolean {
    const services = this.getDynamicServices();
    const initialLen = services.length;
    this.data.dynamicServices = services.filter(s => s.id !== id);
    if (this.data.dynamicServices.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public toggleDynamicService(id: string, enabled?: boolean): DynamicService | undefined {
    const service = this.getDynamicServiceById(id);
    if (!service) return undefined;
    const newEnabled = enabled !== undefined ? enabled : !service.enabled;
    service.enabled = newEnabled;
    service.updatedAt = new Date().toISOString();
    
    // Also sync systemSettings.servicesAvailability if key matches
    const keyMap: Record<string, keyof SystemSettings['servicesAvailability']> = {
      'data': 'data',
      'airtime': 'airtime',
      'electricity': 'electricity',
      'tv': 'tv',
      'exam-pin': 'examPin',
      'airtime-cash': 'airtimeToCash'
    };
    const availKey = keyMap[id];
    if (availKey && this.data.settings.servicesAvailability) {
      this.data.settings.servicesAvailability[availKey] = newEnabled;
    }

    this.save();
    return service;
  }
}

export const db = new Database();
