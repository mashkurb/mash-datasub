import crypto from 'crypto';
import { db } from './db';
import {
  getFlutterwaveConfig,
  initializeFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
  testFlutterwaveConnection,
  checkFlutterwaveDvaAvailability,
  provisionCustomerFlutterwaveAccount
} from './flutterwave';

export {
  getFlutterwaveConfig,
  initializeFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
  testFlutterwaveConnection,
  checkFlutterwaveDvaAvailability,
  provisionCustomerFlutterwaveAccount
};

export function maskKey(key: string | undefined): string {
  if (!key || key.trim().length === 0) return 'Not configured';
  const clean = key.trim();
  if (clean.length <= 8) return '••••' + clean.slice(-2);
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export function getGatewayCredentials() {
  const settings = db.getSettings();
  const dbGateways = (settings.paymentGateways || {}) as any;

  const paystackSecret = dbGateways.paystack?.secretKey?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || '';
  const paystackPublic = dbGateways.paystack?.publicKey?.trim() || process.env.PAYSTACK_PUBLIC_KEY?.trim() || '';
  const paystackEnabled = dbGateways.paystack?.enabled !== false && paystackSecret.length > 0;
  const paystackMode = dbGateways.paystack?.mode || (paystackSecret.startsWith('sk_' + 'live') ? 'live' : 'test');

  const flwSecret = dbGateways.flutterwave?.secretKey?.trim() || process.env.FLUTTERWAVE_SECRET_KEY?.trim() || '';
  const flwPublic = dbGateways.flutterwave?.publicKey?.trim() || process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() || '';
  const flwSecretHash = dbGateways.flutterwave?.secretHash?.trim() || process.env.FLUTTERWAVE_SECRET_HASH?.trim() || 'mash_datasub_flw_secret_hash';
  const flwEncryptionKey = dbGateways.flutterwave?.encryptionKey?.trim() || process.env.FLUTTERWAVE_ENCRYPTION_KEY?.trim() || '';
  const flwEnabled = dbGateways.flutterwave?.enabled !== false && flwSecret.length > 0;
  const flwMode = dbGateways.flutterwave?.mode || (flwSecret.startsWith('FLWSECK_TEST') ? 'test' : 'live');

  const monnifyApiKey = dbGateways.monnify?.apiKey?.trim() || process.env.MONNIFY_API_KEY?.trim() || '';
  const monnifySecretKey = dbGateways.monnify?.secretKey?.trim() || process.env.MONNIFY_SECRET_KEY?.trim() || '';
  const monnifyContract = dbGateways.monnify?.contractCode?.trim() || process.env.MONNIFY_CONTRACT_CODE?.trim() || '';
  const monnifyEnabled = dbGateways.monnify?.enabled === true && monnifyApiKey.length > 0 && monnifySecretKey.length > 0;
  const monnifyMode = dbGateways.monnify?.mode || 'sandbox';

  return {
    paystack: {
      secretKey: paystackSecret,
      publicKey: paystackPublic,
      enabled: paystackEnabled,
      mode: paystackMode
    },
    flutterwave: {
      secretKey: flwSecret,
      publicKey: flwPublic,
      secretHash: flwSecretHash,
      encryptionKey: flwEncryptionKey,
      enabled: flwEnabled,
      mode: flwMode
    },
    monnify: {
      apiKey: monnifyApiKey,
      secretKey: monnifySecretKey,
      contractCode: monnifyContract,
      enabled: monnifyEnabled,
      mode: monnifyMode
    }
  };
}

// ----------------------------------------------------------------------
// PAYSTACK OPERATIONS
// ----------------------------------------------------------------------
export async function initializePaystackTransaction(
  email: string,
  amountInNaira: number,
  reference: string,
  customCallbackUrl?: string
): Promise<{ success: boolean; authorizationUrl?: string; reference?: string; error?: string }> {
  const { paystack } = getGatewayCredentials();

  if (!paystack.secretKey) {
    return {
      success: false,
      error: 'Paystack is Not Configured on this server. Please enter secret key in Admin Panel or environment.'
    };
  }

  try {
    const callbackUrl = customCallbackUrl || process.env.PAYSTACK_CALLBACK_URL;
    const bodyPayload: Record<string, any> = {
      email,
      amount: Math.round(amountInNaira * 100),
      reference,
      channels: ['card', 'bank', 'ussd', 'bank_transfer']
    };

    if (callbackUrl && callbackUrl.trim().length > 0) {
      bodyPayload.callback_url = callbackUrl.trim();
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystack.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const data = await response.json();
    if (!data.status) {
      return {
        success: false,
        error: data.message || 'Paystack initialization failed.'
      };
    }

    return {
      success: true,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Paystack: ${err.message}`
    };
  }
}

export async function verifyPaystackTransaction(reference: string): Promise<{
  success: boolean;
  amount?: number;
  customerEmail?: string;
  paidAt?: string;
  channel?: string;
  gatewayResponse?: string;
  alreadyCredited?: boolean;
  error?: string;
}> {
  const { paystack } = getGatewayCredentials();

  if (!paystack.secretKey) {
    return {
      success: false,
      error: 'Paystack secret key is not configured on this server.'
    };
  }

  // Idempotency check: check if already credited
  const existingTx = db.findTransactionByReference(reference);
  if (existingTx && existingTx.status === 'Successful') {
    return {
      success: true,
      alreadyCredited: true,
      amount: existingTx.amount,
      customerEmail: existingTx.userEmail,
      error: 'This payment transaction has already been credited to your wallet.'
    };
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystack.secretKey}`
      }
    });

    const data = await response.json();
    if (!data.status || data.data.status !== 'success') {
      return {
        success: false,
        error: data.message || (data.data && data.data.gateway_response) || 'Transaction was not successful at Paystack.'
      };
    }

    const amountInNaira = (data.data.requested_amount && data.data.requested_amount > 0)
      ? data.data.requested_amount / 100
      : data.data.amount / 100;
    return {
      success: true,
      amount: amountInNaira,
      customerEmail: data.data.customer?.email,
      paidAt: data.data.paid_at,
      channel: data.data.channel,
      gatewayResponse: data.data.gateway_response
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to verify with Paystack: ${err.message}`
    };
  }
}

export async function testPaystackConnection(secretKey: string): Promise<{ success: boolean; message: string; mode?: string }> {
  if (!secretKey || secretKey.trim().length === 0) {
    return { success: false, message: 'Paystack Secret Key is required.' };
  }
  try {
    const response = await fetch('https://api.paystack.co/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey.trim()}` }
    });
    const data = await response.json();
    if (data.status) {
      const mode = secretKey.startsWith('sk_' + 'live') ? 'LIVE' : 'TEST';
      return { success: true, message: `Paystack connection verified successfully (${mode} mode).`, mode };
    } else {
      return { success: false, message: data.message || 'Invalid Paystack Secret Key.' };
    }
  } catch (err: any) {
    return { success: false, message: `Error reaching Paystack API: ${err.message}` };
  }
}

// ----------------------------------------------------------------------
// MONNIFY OPERATIONS
// ----------------------------------------------------------------------
function getMonnifyBaseUrl(mode: 'sandbox' | 'live'): string {
  return mode === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com';
}

async function getMonnifyAccessToken(apiKey: string, secretKey: string, mode: 'sandbox' | 'live'): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const authHeader = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    const baseUrl = getMonnifyBaseUrl(mode);
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`
      }
    });
    const data = await response.json();
    if (data.requestSuccessful && data.responseBody?.accessToken) {
      return { success: true, token: data.responseBody.accessToken };
    }
    return { success: false, error: data.responseMessage || 'Monnify login failed.' };
  } catch (err: any) {
    return { success: false, error: `Monnify auth network error: ${err.message}` };
  }
}

export async function testMonnifyConnection(apiKey: string, secretKey: string, contractCode: string, mode: 'sandbox' | 'live'): Promise<{ success: boolean; message: string }> {
  if (!apiKey || !secretKey) {
    return { success: false, message: 'API Key and Secret Key are required.' };
  }
  const auth = await getMonnifyAccessToken(apiKey.trim(), secretKey.trim(), mode);
  if (!auth.success) {
    return { success: false, message: auth.error || 'Monnify credentials authentication failed.' };
  }
  return { success: true, message: `Monnify connection authenticated successfully (${mode.toUpperCase()} mode).` };
}

export async function initializeMonnifyTransaction(
  email: string,
  name: string,
  amountInNaira: number,
  reference: string
): Promise<{ success: boolean; checkoutUrl?: string; reference?: string; error?: string }> {
  const { monnify } = getGatewayCredentials();
  if (!monnify.enabled || !monnify.apiKey || !monnify.secretKey || !monnify.contractCode) {
    return {
      success: false,
      error: 'Monnify is currently not enabled or credentials are incomplete.'
    };
  }

  const auth = await getMonnifyAccessToken(monnify.apiKey, monnify.secretKey, monnify.mode as any);
  if (!auth.success || !auth.token) {
    return { success: false, error: auth.error || 'Failed to authenticate with Monnify.' };
  }

  try {
    const baseUrl = getMonnifyBaseUrl(monnify.mode as any);
    const response = await fetch(`${baseUrl}/api/v1/merchant/transactions/init-transaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInNaira,
        customerName: name,
        customerEmail: email,
        paymentReference: reference,
        paymentDescription: 'Mash DataSub Wallet Funding',
        currencyCode: 'NGN',
        contractCode: monnify.contractCode,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER', 'USSD']
      })
    });

    const data = await response.json();
    if (data.requestSuccessful && data.responseBody?.checkoutUrl) {
      return {
        success: true,
        checkoutUrl: data.responseBody.checkoutUrl,
        reference: data.responseBody.transactionReference || reference
      };
    }

    return {
      success: false,
      error: data.responseMessage || 'Failed to initialize Monnify checkout.'
    };
  } catch (err: any) {
    return { success: false, error: `Monnify network error: ${err.message}` };
  }
}

// Verify Monnify Webhook Signature
export function verifyMonnifyWebhookSignature(payloadString: string, signature: string, secretKey: string): boolean {
  if (!signature || !secretKey) return false;
  try {
    const computed = crypto.createHmac('sha512', secretKey).update(payloadString).digest('hex');
    return computed.toLowerCase() === signature.toLowerCase();
  } catch {
    return false;
  }
}
