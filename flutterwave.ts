import crypto from 'crypto';
import { db, DedicatedVirtualAccount, User } from './db.js';

export interface FlutterwaveConfig {
  enabled: boolean;
  mode: 'test' | 'live';
  publicKey: string;
  secretKey: string;
  secretHash: string;
  encryptionKey?: string;
}

export function getFlutterwaveConfig(): FlutterwaveConfig {
  const settings = db.getSettings();
  const flwSettings = settings.paymentGateways?.flutterwave;

  const secretKey =
    flwSettings?.secretKey?.trim() ||
    process.env.FLUTTERWAVE_SECRET_KEY?.trim() ||
    '';

  const publicKey =
    flwSettings?.publicKey?.trim() ||
    process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() ||
    '';

  const secretHash =
    flwSettings?.secretHash?.trim() ||
    process.env.FLUTTERWAVE_SECRET_HASH?.trim() ||
    'mash_datasub_flw_secret_hash';

  const encryptionKey =
    flwSettings?.encryptionKey?.trim() ||
    process.env.FLUTTERWAVE_ENCRYPTION_KEY?.trim() ||
    '';

  const mode =
    secretKey.startsWith('FLWSECK_TEST') ? 'test' : 'live';

  const enabled =
    flwSettings?.enabled !== false && !!secretKey;

  return {
    enabled,
    mode,
    publicKey,
    secretKey,
    secretHash,
    encryptionKey
  };
}

/**
 * Initialize Flutterwave Standard Hosted Checkout
 * Official v3 endpoint: POST https://api.flutterwave.com/v3/payments
 */
export async function initializeFlutterwavePayment(params: {
  email: string;
  amount: number;
  reference?: string;
  callbackUrl: string;
  phone?: string;
  name?: string;
  metadata?: Record<string, any>;
}): Promise<{
  success: boolean;
  authorizationUrl: string;
  reference: string;
  message?: string;
}> {
  const config = getFlutterwaveConfig();
  if (!config.secretKey) {
    throw new Error('Flutterwave secret key is not configured.');
  }

  const reference =
    params.reference || `MDS-FLW-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const payload = {
    tx_ref: reference,
    amount: params.amount,
    currency: 'NGN',
    redirect_url: params.callbackUrl,
    customer: {
      email: params.email,
      phonenumber: params.phone || '08000000000',
      name: params.name || params.email.split('@')[0]
    },
    customizations: {
      title: 'Mash DataSub Wallet Funding',
      description: `Wallet deposit of ₦${params.amount.toLocaleString()} for ${params.email}`,
      logo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    },
    meta: {
      userId: params.metadata?.userId || '',
      service: 'WALLET_FUNDING',
      provider: 'FLUTTERWAVE',
      ...(params.metadata || {})
    }
  };

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || data.status !== 'success' || !data.data?.link) {
    const errorMsg = data.message || `Flutterwave payment initiation failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return {
    success: true,
    authorizationUrl: data.data.link,
    reference,
    message: data.message
  };
}

/**
 * Verify a Flutterwave transaction directly with the API
 * Official v3 endpoint: GET https://api.flutterwave.com/v3/transactions/{id}/verify
 * Or: GET https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref={ref}
 */
export async function verifyFlutterwaveTransaction(
  transactionIdOrRef: string | number
): Promise<{
  success: boolean;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  flwRef: string;
  customerEmail: string;
  customerPhone?: string;
  paymentType: string;
  paidAt?: string;
  metadata?: any;
  rawData: any;
}> {
  const config = getFlutterwaveConfig();
  if (!config.secretKey) {
    throw new Error('Flutterwave secret key is not configured.');
  }

  let url: string;
  const isNumeric = /^\d+$/.test(String(transactionIdOrRef).trim());

  if (isNumeric) {
    url = `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionIdOrRef).trim())}/verify`;
  } else {
    url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(transactionIdOrRef).trim())}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json'
    }
  });

  const json = await response.json();

  if (!response.ok || json.status !== 'success' || !json.data) {
    const errorMsg = json.message || `Flutterwave verification failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  const txData = json.data;
  const isSuccessful = txData.status === 'successful';

  return {
    success: isSuccessful,
    status: txData.status,
    amount: Number(txData.amount || 0),
    currency: txData.currency || 'NGN',
    reference: txData.tx_ref || String(transactionIdOrRef),
    flwRef: txData.flw_ref || '',
    customerEmail: txData.customer?.email || '',
    customerPhone: txData.customer?.phone_number || '',
    paymentType: txData.payment_type || '',
    paidAt: txData.created_at,
    metadata: txData.meta,
    rawData: txData
  };
}

/**
 * Verify Flutterwave Webhook Signature / Secret Hash
 * Flutterwave sends a header 'verif-hash' matching the secret hash configured in the dashboard.
 */
export function verifyFlutterwaveWebhookSignature(reqHeaderSecretHash?: string): boolean {
  const config = getFlutterwaveConfig();
  if (!config.secretHash) return false;
  if (!reqHeaderSecretHash) return false;

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(config.secretHash.trim());
  const actual = Buffer.from(reqHeaderSecretHash.trim());

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Test connectivity with Flutterwave API using provided or stored secret key
 */
export async function testFlutterwaveConnection(overrideSecretKey?: string): Promise<{
  success: boolean;
  mode: 'test' | 'live';
  message: string;
  merchantName?: string;
}> {
  const config = getFlutterwaveConfig();
  const secretKey = overrideSecretKey?.trim() || config.secretKey;

  if (!secretKey) {
    return {
      success: false,
      mode: 'test',
      message: 'No secret key provided or configured.'
    };
  }

  const mode = secretKey.startsWith('FLWSECK_TEST') ? 'test' : 'live';

  try {
    // Check balances endpoint to verify valid API credentials
    const response = await fetch('https://api.flutterwave.com/v3/balances', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      return {
        success: true,
        mode,
        message: `Successfully connected to Flutterwave in ${mode.toUpperCase()} mode!`
      };
    } else {
      return {
        success: false,
        mode,
        message: data.message || `Flutterwave API returned status ${response.status}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      mode,
      message: `Connection failed: ${err.message}`
    };
  }
}

/**
 * Check if the merchant's Flutterwave account is eligible / configured for dedicated virtual accounts
 */
export async function checkFlutterwaveDvaAvailability(): Promise<{
  available: boolean;
  status: 'ACTIVE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  message: string;
  nextStep?: string;
}> {
  const config = getFlutterwaveConfig();
  if (!config.secretKey) {
    return {
      available: false,
      status: 'NOT_CONFIGURED',
      message: 'Flutterwave secret key is not configured in settings or environment.',
      nextStep: 'Add your Flutterwave Secret Key (FLWSECK-...) in Admin -> Payment Gateways.'
    };
  }

  try {
    const testResult = await testFlutterwaveConnection();
    if (!testResult.success) {
      return {
        available: false,
        status: 'UNAVAILABLE',
        message: `Flutterwave API connection check failed: ${testResult.message}`,
        nextStep: 'Ensure your Flutterwave Secret Key is valid and has active API access.'
      };
    }

    return {
      available: true,
      status: 'ACTIVE',
      message: `Flutterwave is connected in ${testResult.mode.toUpperCase()} mode. Virtual accounts can be provisioned.`,
      nextStep: 'For permanent virtual accounts, CBN mandates valid customer BVN/NIN.'
    };
  } catch (err: any) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      message: `Flutterwave availability check error: ${err.message}`
    };
  }
}

/**
 * Provision or retrieve a Dedicated Static Virtual Account from Flutterwave
 * Official v3 endpoint: POST https://api.flutterwave.com/v3/virtual-account-numbers
 */
export async function provisionCustomerFlutterwaveAccount(
  user: User,
  bvn?: string,
  nin?: string
): Promise<DedicatedVirtualAccount> {
  const config = getFlutterwaveConfig();
  const existing = db.getDedicatedVirtualAccountByUserIdAndProvider(user.id, 'FLUTTERWAVE');

  // If already active with valid account number, return it
  if (existing && existing.status === 'ACTIVE' && existing.accountNumber) {
    return existing;
  }

  if (!config.secretKey) {
    const failRecord: DedicatedVirtualAccount = {
      id: existing?.id || crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      accountNumber: '',
      accountName: '',
      bankName: '',
      provider: 'FLUTTERWAVE',
      status: 'NOT_ELIGIBLE',
      failureReason: 'Flutterwave payment gateway is not configured or enabled by administrator.',
      totalReceived: existing?.totalReceived || 0,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return db.saveDedicatedVirtualAccount(failRecord);
  }

  // Split name for Flutterwave customer fields
  const nameParts = (user.fullName || user.email.split('@')[0]).trim().split(' ');
  const firstName = nameParts[0] || 'Mash';
  const lastName = nameParts.slice(1).join(' ') || 'Customer';

  const txRef = `VA-MDS-FLW-${user.id.substring(0, 8)}-${Date.now()}`;

  const payload: Record<string, any> = {
    email: user.email,
    is_permanent: true,
    tx_ref: txRef,
    phonenumber: user.phone || '08000000000',
    firstname: firstName,
    lastname: lastName,
    narration: `Mash DataSub - ${user.fullName}`
  };

  const cleanBvn = bvn?.trim();
  const cleanNin = nin?.trim();

  if (cleanBvn) {
    payload.bvn = cleanBvn;
  }
  if (cleanNin) {
    payload.nin = cleanNin;
  }

  try {
    const response = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const json = await response.json();

    if (
      response.ok &&
      json.status === 'success' &&
      json.data?.account_number
    ) {
      const activeRecord: DedicatedVirtualAccount = {
        id: existing?.id || crypto.randomUUID(),
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        userPhone: user.phone,
        accountNumber: json.data.account_number,
        accountName: json.data.account_name || `Mash DataSub / ${user.fullName}`,
        bankName: json.data.bank_name || 'Wema Bank',
        bankSlug: json.data.bank_code || '',
        provider: 'FLUTTERWAVE',
        reference: txRef,
        orderRef: json.data.order_ref || '',
        flwRef: json.data.flw_ref || '',
        bvnProvided: !!cleanBvn,
        status: 'ACTIVE',
        failureReason: undefined,
        totalReceived: existing?.totalReceived || 0,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return db.saveDedicatedVirtualAccount(activeRecord);
    } else {
      const errorMsg =
        json.message ||
        (json.data && typeof json.data === 'string' ? json.data : null) ||
        `Flutterwave returned code ${response.status}`;

      const failRecord: DedicatedVirtualAccount = {
        id: existing?.id || crypto.randomUUID(),
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        userPhone: user.phone,
        accountNumber: '',
        accountName: '',
        bankName: '',
        provider: 'FLUTTERWAVE',
        reference: txRef,
        orderRef: json.data?.order_ref || '',
        flwRef: json.data?.flw_ref || '',
        bvnProvided: !!cleanBvn,
        status: 'NOT_ELIGIBLE',
        failureReason: errorMsg,
        totalReceived: existing?.totalReceived || 0,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return db.saveDedicatedVirtualAccount(failRecord);
    }
  } catch (err: any) {
    const failRecord: DedicatedVirtualAccount = {
      id: existing?.id || crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      accountNumber: '',
      accountName: '',
      bankName: '',
      provider: 'FLUTTERWAVE',
      status: 'FAILED',
      failureReason: `Network or API exception: ${err.message}`,
      totalReceived: existing?.totalReceived || 0,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return db.saveDedicatedVirtualAccount(failRecord);
  }
}
