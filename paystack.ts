import { db } from './db';

interface PaystackInitResult {
  success: boolean;
  authorizationUrl?: string;
  reference?: string;
  error?: string;
}

interface PaystackVerifyResult {
  success: boolean;
  amount?: number; // In Naira
  customerEmail?: string;
  status?: string;
  error?: string;
}

export async function initializePaystackTransaction(
  email: string,
  amountInNaira: number,
  reference: string
): Promise<PaystackInitResult> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secretKey) {
    return {
      success: false,
      error: 'Paystack is not configured yet. Server requires PAYSTACK_SECRET_KEY in environment variables.'
    };
  }

  try {
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${process.env.APP_URL || ''}/wallet?paystack_ref=${reference}`;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amountInNaira * 100), // Paystack uses kobo
        reference,
        callback_url: callbackUrl,
        channels: ['card', 'bank', 'ussd', 'bank_transfer']
      })
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

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifyResult> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secretKey) {
    return {
      success: false,
      error: 'Paystack is not configured on this server (missing PAYSTACK_SECRET_KEY).'
    };
  }

  // Check if reference has already been credited
  const existingTx = db.findTransactionByReference(reference);
  if (existingTx && existingTx.status === 'Successful') {
    return {
      success: false,
      error: 'This payment transaction has already been credited to your wallet.'
    };
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });

    const data = await response.json();
    if (!data.status || data.data.status !== 'success') {
      return {
        success: false,
        status: data.data?.status || 'failed',
        error: data.data?.gateway_response || data.message || 'Payment verification failed at Paystack.'
      };
    }

    const verifiedAmountKobo = data.data.amount;
    const amountInNaira = verifiedAmountKobo / 100;

    return {
      success: true,
      amount: amountInNaira,
      customerEmail: data.data.customer?.email,
      status: 'success'
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to verify payment with Paystack: ${err.message}`
    };
  }
}
