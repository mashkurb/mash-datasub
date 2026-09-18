import crypto from 'crypto';
import { db, DedicatedVirtualAccount, User } from './db';
import {
  checkFlutterwaveDvaAvailability,
  provisionCustomerFlutterwaveAccount
} from './flutterwave';

export {
  checkFlutterwaveDvaAvailability,
  provisionCustomerFlutterwaveAccount
};

function getPaystackSecretKey(): string {
  const settings = db.getSettings();
  const dbKey = settings.paymentGateways?.paystack?.secretKey;
  if (dbKey && !dbKey.includes('••')) {
    return dbKey.trim();
  }
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}

export interface PaystackDvaStatus {
  available: boolean;
  status: 'ACTIVE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  message: string;
  nextStep?: string;
  details?: any;
}

/**
 * Checks with Paystack whether Dedicated NUBAN / Virtual Accounts are enabled for this merchant account.
 */
export async function checkPaystackDvaAvailability(): Promise<PaystackDvaStatus> {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return {
      available: false,
      status: 'NOT_CONFIGURED',
      message: 'Paystack secret key is not configured. Please configure PAYSTACK_SECRET_KEY in Admin > Payment Gateways.'
    };
  }

  try {
    const res = await fetch('https://api.paystack.co/dedicated_account/available_providers', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (data.status === true && Array.isArray(data.data) && data.data.length > 0) {
      return {
        available: true,
        status: 'ACTIVE',
        message: 'Paystack Dedicated Virtual Accounts are active and available for customer provisioning.',
        details: data.data
      };
    }

    const failureMsg = data.message || 'Dedicated NUBAN is not available for your business account.';
    const nextStep = data.meta?.nextStep || 'To activate Dedicated Virtual Accounts, Paystack requires business verification (CAC) and an activation email request sent to support@paystack.com.';

    return {
      available: false,
      status: 'UNAVAILABLE',
      message: failureMsg,
      nextStep,
      details: data
    };
  } catch (err: any) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      message: `Failed to connect to Paystack API: ${err.message}`
    };
  }
}

/**
 * Ensures the customer exists on Paystack and returns their customer_code and id.
 */
export async function createOrFetchPaystackCustomer(user: User): Promise<{
  success: boolean;
  customerCode?: string;
  customerId?: string | number;
  error?: string;
}> {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return { success: false, error: 'Paystack secret key is missing.' };
  }

  const nameParts = (user.fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  try {
    // Attempt to create customer on Paystack
    const res = await fetch('https://api.paystack.co/customer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        phone: user.phone.trim(),
        metadata: {
          mashUserId: user.id,
          phone: user.phone
        }
      })
    });

    const data = await res.json();

    if (data.status && data.data) {
      return {
        success: true,
        customerCode: data.data.customer_code,
        customerId: data.data.id
      };
    }

    // If customer already exists or creation returned an error, attempt fetching by email
    const fetchRes = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(user.email.trim())}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const fetchData = await fetchRes.json();
    if (fetchData.status && fetchData.data) {
      return {
        success: true,
        customerCode: fetchData.data.customer_code,
        customerId: fetchData.data.id
      };
    }

    return {
      success: false,
      error: data.message || 'Could not create customer profile on Paystack.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Paystack customer API: ${err.message}`
    };
  }
}

/**
 * Creates or retrieves a real Dedicated Virtual Account for a customer (Paystack or Flutterwave).
 */
export async function provisionCustomerDedicatedAccount(
  userId: string,
  provider: 'PAYSTACK' | 'FLUTTERWAVE' = 'PAYSTACK',
  bvn?: string,
  nin?: string
): Promise<DedicatedVirtualAccount> {
  const user = db.findUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  if (provider === 'FLUTTERWAVE') {
    return provisionCustomerFlutterwaveAccount(user, bvn, nin);
  }

  // Check if DVA already exists for Paystack and is active
  const existingDva = db.getDedicatedVirtualAccountByUserIdAndProvider(userId, 'PAYSTACK');
  if (existingDva && existingDva.status === 'ACTIVE' && existingDva.accountNumber) {
    return existingDva;
  }

  const secretKey = getPaystackSecretKey();
  const now = new Date().toISOString();

  // 1. Check if Paystack is configured
  if (!secretKey) {
    const dvaRecord: DedicatedVirtualAccount = {
      id: existingDva?.id || 'dva_' + crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      paystackCustomerId: existingDva?.paystackCustomerId || '',
      customerCode: existingDva?.customerCode || '',
      accountNumber: '', // Strictly NO fake numbers
      accountName: `Mash DataSub / ${user.fullName}`,
      bankName: 'Paystack Partner Bank',
      provider: 'PAYSTACK',
      status: 'PENDING',
      failureReason: 'Paystack API secret key is not configured on the server.',
      totalReceived: existingDva?.totalReceived || 0,
      createdAt: existingDva?.createdAt || now,
      updatedAt: now
    };
    return db.saveDedicatedVirtualAccount(dvaRecord);
  }

  // 2. Create or fetch Paystack customer profile
  const custResult = await createOrFetchPaystackCustomer(user);
  if (!custResult.success || !custResult.customerCode) {
    const dvaRecord: DedicatedVirtualAccount = {
      id: existingDva?.id || 'dva_' + crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      paystackCustomerId: '',
      customerCode: '',
      accountNumber: '', // Strictly NO fake numbers
      accountName: `Mash DataSub / ${user.fullName}`,
      bankName: 'Paystack Partner Bank',
      provider: 'PAYSTACK',
      status: 'FAILED',
      failureReason: custResult.error || 'Failed to initialize customer on Paystack.',
      totalReceived: existingDva?.totalReceived || 0,
      createdAt: existingDva?.createdAt || now,
      updatedAt: now
    };
    return db.saveDedicatedVirtualAccount(dvaRecord);
  }

  const customerCode = custResult.customerCode;
  const customerId = custResult.customerId || '';

  // 3. Query Paystack to see if customer already has an active dedicated account
  try {
    const existingCheckRes = await fetch(`https://api.paystack.co/dedicated_account?customer=${encodeURIComponent(customerCode)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const existingCheckData = await existingCheckRes.json();
    if (existingCheckData.status && Array.isArray(existingCheckData.data) && existingCheckData.data.length > 0) {
      const activeDva = existingCheckData.data.find((d: any) => d.active && d.account_number);
      if (activeDva) {
        const dvaRecord: DedicatedVirtualAccount = {
          id: existingDva?.id || 'dva_' + crypto.randomUUID(),
          userId: user.id,
          userName: user.fullName,
          userEmail: user.email,
          userPhone: user.phone,
          paystackCustomerId: customerId,
          customerCode: customerCode,
          dvaId: activeDva.id,
          accountNumber: activeDva.account_number,
          accountName: activeDva.account_name || `Mash DataSub / ${user.fullName}`,
          bankName: activeDva.bank?.name || 'Wema Bank',
          bankSlug: activeDva.bank?.slug,
          provider: 'PAYSTACK',
          reference: activeDva.assigned ? 'assigned' : undefined,
          status: 'ACTIVE',
          failureReason: undefined,
          totalReceived: existingDva?.totalReceived || 0,
          createdAt: existingDva?.createdAt || now,
          updatedAt: now
        };
        return db.saveDedicatedVirtualAccount(dvaRecord);
      }
    }
  } catch {
    // Proceed to create dedicated account
  }

  // 4. Request Paystack Dedicated Virtual Account
  try {
    const dvaRes = await fetch('https://api.paystack.co/dedicated_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer: customerCode,
        preferred_bank: 'wema-bank'
      })
    });

    const dvaData = await dvaRes.json();

    if (dvaData.status === true && dvaData.data && dvaData.data.account_number) {
      // Real Paystack DVA successfully created!
      const dvaRecord: DedicatedVirtualAccount = {
        id: existingDva?.id || 'dva_' + crypto.randomUUID(),
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        userPhone: user.phone,
        paystackCustomerId: customerId,
        customerCode: customerCode,
        dvaId: dvaData.data.id,
        accountNumber: String(dvaData.data.account_number),
        accountName: dvaData.data.account_name || `Mash DataSub / ${user.fullName}`,
        bankName: dvaData.data.bank?.name || 'Wema Bank',
        bankSlug: dvaData.data.bank?.slug,
        provider: 'PAYSTACK',
        reference: dvaData.data.reference || dvaData.data.assignment?.integration,
        status: 'ACTIVE',
        failureReason: undefined,
        totalReceived: existingDva?.totalReceived || 0,
        createdAt: existingDva?.createdAt || now,
        updatedAt: now
      };
      db.addAuditLog(user.email, 'DVA_PROVISIONED', `Real Paystack DVA assigned: ${dvaRecord.bankName} ${dvaRecord.accountNumber}`);
      return db.saveDedicatedVirtualAccount(dvaRecord);
    }

    // Paystack refused DVA (e.g. "Dedicated NUBAN is not available for your business")
    const reason = dvaData.message || 'Dedicated NUBAN is not available for this business account.';
    const nextStep = dvaData.meta?.nextStep ? ` (${dvaData.meta.nextStep})` : '';

    const dvaRecord: DedicatedVirtualAccount = {
      id: existingDva?.id || 'dva_' + crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      paystackCustomerId: customerId,
      customerCode: customerCode,
      accountNumber: '', // Strictly NO fake numbers!
      accountName: `Mash DataSub / ${user.fullName}`,
      bankName: 'Wema Bank (Paystack)',
      provider: 'PAYSTACK',
      status: 'NOT_ELIGIBLE',
      failureReason: `${reason}${nextStep}`,
      totalReceived: existingDva?.totalReceived || 0,
      createdAt: existingDva?.createdAt || now,
      updatedAt: now
    };
    return db.saveDedicatedVirtualAccount(dvaRecord);
  } catch (err: any) {
    const dvaRecord: DedicatedVirtualAccount = {
      id: existingDva?.id || 'dva_' + crypto.randomUUID(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: user.phone,
      paystackCustomerId: customerId,
      customerCode: customerCode,
      accountNumber: '',
      accountName: `Mash DataSub / ${user.fullName}`,
      bankName: 'Wema Bank (Paystack)',
      provider: 'PAYSTACK',
      status: 'FAILED',
      failureReason: `Network error: ${err.message}`,
      totalReceived: existingDva?.totalReceived || 0,
      createdAt: existingDva?.createdAt || now,
      updatedAt: now
    };
    return db.saveDedicatedVirtualAccount(dvaRecord);
  }
}

export const provisionCustomerPaystackAccount = provisionCustomerDedicatedAccount;
