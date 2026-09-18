import crypto from 'crypto';
import { db } from '../../db.js';
import {
  PaymentGateway,
  PaymentProviderId,
  GatewayCapabilities,
  PaymentInitParams,
  PaymentInitResult,
  PaymentVerifyResult,
  CustomerVirtualAccountParams,
  VirtualAccountResult,
  WebhookProcessResult,
  TransactionStatusResult,
  RefundResult,
  ProviderBalanceResult,
  TestConnectionResult
} from '../types.js';

export class PaystackProvider implements PaymentGateway {
  public readonly name = 'Paystack';
  public readonly providerId: PaymentProviderId = 'PAYSTACK';
  public readonly capabilities: GatewayCapabilities = {
    supportsDedicatedVirtualAccounts: true,
    supportsDynamicVirtualAccounts: true,
    supportsCheckout: true,
    supportsBankTransfer: true,
    supportsRefunds: true,
    supportsPayouts: true
  };

  private readonly baseUrl = 'https://api.paystack.co';

  private getCredentials() {
    const config = db.getPaymentGatewayConfig().providers.paystack;
    const secretKey = (config?.secretKey || process.env.PAYSTACK_SECRET_KEY || '').trim();
    const publicKey = (config?.publicKey || process.env.PAYSTACK_PUBLIC_KEY || '').trim();
    const isLive = config?.mode === 'live' || secretKey.startsWith('sk_' + 'live');
    return { secretKey, publicKey, isLive, enabled: config?.enabled ?? true };
  }

  public async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const { secretKey, publicKey, enabled } = this.getCredentials();
    if (!enabled) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: 'Paystack provider is currently disabled by administrator.'
      };
    }
    if (!secretKey) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: 'Paystack Secret Key is not configured in Admin settings.'
      };
    }

    try {
      const amountKobo = Math.round(params.amount * 100);
      const payload: Record<string, any> = {
        reference: params.reference,
        amount: amountKobo,
        email: params.email,
        callback_url: params.callbackUrl,
        metadata: {
          customer_name: params.name,
          customer_phone: params.phone,
          ...(params.metadata || {})
        }
      };

      if (params.channels && params.channels.length > 0) {
        payload.channels = params.channels;
      }

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          reference: params.reference,
          provider: this.providerId,
          message: data.message || 'Failed to initialize Paystack transaction',
          raw: data
        };
      }

      return {
        success: true,
        reference: params.reference,
        provider: this.providerId,
        authorizationUrl: data.data.authorization_url,
        checkoutUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        publicKey: publicKey,
        providerReference: data.data.reference,
        message: 'Paystack checkout initialized successfully',
        raw: data.data
      };
    } catch (err: any) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: err.message || 'Network error communicating with Paystack'
      };
    }
  }

  public async verifyPayment(reference: string): Promise<PaymentVerifyResult> {
    const { secretKey } = this.getCredentials();
    if (!secretKey) {
      return {
        success: false,
        verified: false,
        provider: this.providerId,
        reference,
        amount: 0,
        currency: 'NGN',
        status: 'FAILED',
        message: 'Paystack Secret Key is not configured.'
      };
    }

    try {
      const cleanRef = encodeURIComponent(reference.trim());
      const response = await fetch(`${this.baseUrl}/transaction/verify/${cleanRef}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          verified: false,
          provider: this.providerId,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'FAILED',
          message: data.message || 'Paystack verification failed',
          raw: data
        };
      }

      const tx = data.data;
      const amountNaira = (tx.amount || 0) / 100;
      const feeNaira = (tx.fees || 0) / 100;
      const isSuccess = tx.status === 'success';

      return {
        success: true,
        verified: isSuccess,
        provider: this.providerId,
        reference: tx.reference || reference,
        providerTransactionId: String(tx.id || ''),
        amount: amountNaira,
        fee: feeNaira,
        netAmount: amountNaira - feeNaira,
        currency: tx.currency || 'NGN',
        channel: tx.channel,
        paidAt: tx.paid_at,
        customerEmail: tx.customer?.email,
        status: isSuccess ? 'SUCCESS' : (tx.status === 'abandoned' ? 'FAILED' : 'PENDING'),
        message: tx.gateway_response || 'Paystack verification completed',
        raw: tx
      };
    } catch (err: any) {
      return {
        success: false,
        verified: false,
        provider: this.providerId,
        reference,
        amount: 0,
        currency: 'NGN',
        status: 'FAILED',
        message: err.message || 'Network error verifying Paystack transaction'
      };
    }
  }

  public async createCustomerVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    const { secretKey } = this.getCredentials();
    if (!secretKey) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'UNAVAILABLE',
        message: 'Paystack Secret Key is not configured.'
      };
    }

    try {
      // 1. Create or get customer in Paystack
      const custResp = await fetch(`${this.baseUrl}/customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: customer.email,
          first_name: customer.firstName,
          last_name: customer.lastName,
          phone: customer.phone
        })
      });
      const custData = await custResp.json();
      if (!custResp.ok || !custData.status) {
        return {
          success: false,
          supported: true,
          provider: this.providerId,
          status: 'FAILED',
          message: custData.message || 'Failed to create Paystack customer',
          raw: custData
        };
      }

      const customerCode = custData.data.customer_code;

      // 2. Request dedicated virtual account
      const dvaResp = await fetch(`${this.baseUrl}/dedicated_account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: customerCode,
          preferred_bank: customer.preferredBank || 'wema-bank'
        })
      });

      const dvaData = await dvaResp.json();
      if (!dvaResp.ok || !dvaData.status) {
        return {
          success: false,
          supported: true,
          provider: this.providerId,
          customerCode,
          status: 'FAILED',
          message: dvaData.message || 'Failed to assign Paystack dedicated virtual account',
          raw: dvaData
        };
      }

      const dva = dvaData.data;
      return {
        success: true,
        supported: true,
        provider: this.providerId,
        accountNumber: dva.account_number,
        accountName: dva.account_name,
        bankName: dva.bank?.name || 'Wema Bank',
        bankCode: dva.bank?.id ? String(dva.bank.id) : undefined,
        customerCode,
        status: 'ACTIVE',
        message: 'Paystack Dedicated Virtual Account created successfully',
        raw: dva
      };
    } catch (err: any) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'FAILED',
        message: err.message || 'Error creating Paystack dedicated account'
      };
    }
  }

  public async getVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    // Check local database first
    const existing = db.getDedicatedVirtualAccount(customer.userId);
    if (existing && existing.provider === 'PAYSTACK' && existing.accountNumber) {
      return {
        success: true,
        supported: true,
        provider: this.providerId,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
        bankName: existing.bankName,
        status: existing.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        message: 'Retrieved active dedicated virtual account'
      };
    }

    return this.createCustomerVirtualAccount(customer);
  }

  public async handleWebhook(payload: any, headers?: Record<string, string | string[]>): Promise<WebhookProcessResult> {
    const { secretKey } = this.getCredentials();

    // Verify HMAC-SHA512 signature
    const signature = headers?.['x-paystack-signature'] || headers?.['X-Paystack-Signature'];
    const sigString = Array.isArray(signature) ? signature[0] : signature;

    let verified = false;
    if (sigString && secretKey) {
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const hash = crypto.createHmac('sha512', secretKey).update(rawPayload).digest('hex');
      verified = hash === sigString;
    }

    // Strict signature enforcement when Paystack secret key is configured
    if (secretKey && (!sigString || !verified)) {
      return {
        handled: false,
        verified: false,
        eventType: 'signature_mismatch',
        status: 'FAILED',
        message: 'Invalid or missing Paystack HMAC-SHA512 webhook signature'
      };
    }

    const dataObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const event = dataObj?.event;
    const data = dataObj?.data;

    if (!event || !data) {
      return {
        handled: false,
        verified: false,
        eventType: 'unknown',
        message: 'Invalid Paystack webhook payload'
      };
    }

    if (event === 'charge.success') {
      const amountNaira = (data.amount || 0) / 100;
      const feeNaira = (data.fees || 0) / 100;
      const isDva = !!(data.dedicated_account || data.channel === 'dedicated_nuban');

      return {
        handled: true,
        verified,
        eventType: event,
        reference: data.reference,
        providerTransactionId: String(data.id || ''),
        amount: amountNaira,
        fee: feeNaira,
        customerEmail: data.customer?.email,
        status: 'SUCCESS',
        isVirtualAccountDeposit: isDva,
        virtualAccountNumber: data.dedicated_account?.account_number,
        message: 'Charge successful processed',
        raw: data
      };
    }

    return {
      handled: true,
      verified,
      eventType: event,
      reference: data.reference,
      providerTransactionId: String(data.id || ''),
      status: 'IGNORED',
      message: `Unhandled Paystack event: ${event}`,
      raw: data
    };
  }

  public async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    const res = await this.verifyPayment(reference);
    return {
      provider: this.providerId,
      reference,
      providerTransactionId: res.providerTransactionId,
      status: res.status === 'SUCCESS' ? 'SUCCESS' : (res.status === 'FAILED' ? 'FAILED' : 'PENDING'),
      amount: res.amount,
      message: res.message,
      raw: res.raw
    };
  }

  public async refundPayment(reference: string, amount?: number): Promise<RefundResult> {
    const { secretKey } = this.getCredentials();
    if (!secretKey) {
      return {
        success: false,
        reference,
        status: 'FAILED',
        message: 'Paystack Secret Key is not configured.'
      };
    }

    try {
      const payload: Record<string, any> = { transaction: reference };
      if (amount && amount > 0) {
        payload.amount = Math.round(amount * 100);
      }

      const response = await fetch(`${this.baseUrl}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          reference,
          status: 'FAILED',
          message: data.message || 'Refund request failed',
          raw: data
        };
      }

      return {
        success: true,
        refundId: String(data.data?.id || ''),
        reference,
        amount: (data.data?.amount || 0) / 100,
        status: 'PROCESSED',
        message: data.message || 'Refund processed successfully',
        raw: data.data
      };
    } catch (err: any) {
      return {
        success: false,
        reference,
        status: 'FAILED',
        message: err.message || 'Network error processing refund'
      };
    }
  }

  public async getProviderBalance(): Promise<ProviderBalanceResult> {
    const { secretKey } = this.getCredentials();
    if (!secretKey) {
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/balance`, {
        headers: { 'Authorization': `Bearer ${secretKey}` }
      });
      const data = await response.json();
      if (response.ok && data.status && Array.isArray(data.data)) {
        const ngn = data.data.find((b: any) => b.currency === 'NGN') || data.data[0];
        if (ngn) {
          return {
            provider: this.providerId,
            availableBalance: (ngn.balance || 0) / 100,
            currency: ngn.currency || 'NGN',
            raw: data.data
          };
        }
      }
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN',
        raw: data
      };
    } catch (err) {
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN'
      };
    }
  }

  public async testConnection(): Promise<TestConnectionResult> {
    const { secretKey, isLive } = this.getCredentials();
    if (!secretKey) {
      return {
        success: false,
        provider: this.providerId,
        mode: isLive ? 'live' : 'test',
        message: 'Paystack Secret Key is missing. Please configure your key in Admin settings.'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/balance`, {
        headers: { 'Authorization': `Bearer ${secretKey}` }
      });
      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          provider: this.providerId,
          mode: isLive ? 'live' : 'test',
          message: data.message || 'Invalid Paystack Secret Key or authentication failure'
        };
      }

      const ngn = Array.isArray(data.data) ? (data.data.find((b: any) => b.currency === 'NGN') || data.data[0]) : null;
      const availableBalance = (ngn?.balance || 0) / 100;

      return {
        success: true,
        provider: this.providerId,
        mode: isLive ? 'live' : 'test',
        message: `Successfully connected to Paystack (${isLive ? 'LIVE' : 'TEST'} mode). Paystack Balance: ₦${availableBalance.toLocaleString()}`,
        balance: { provider: this.providerId, availableBalance, currency: 'NGN' },
        details: { mode: isLive ? 'live' : 'test', environment: isLive ? 'Production' : 'Sandbox' }
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.providerId,
        mode: isLive ? 'live' : 'test',
        message: `Connection failed: ${err.message || 'Invalid credentials or network issue'}`
      };
    }
  }
}
