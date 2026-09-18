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

export class SquadProvider implements PaymentGateway {
  public readonly name = 'Squad';
  public readonly providerId: PaymentProviderId = 'SQUAD';
  public readonly capabilities: GatewayCapabilities = {
    supportsDedicatedVirtualAccounts: true,
    supportsDynamicVirtualAccounts: true,
    supportsCheckout: true,
    supportsBankTransfer: true,
    supportsRefunds: true,
    supportsPayouts: true
  };

  private getCredentials() {
    const config = (db.getPaymentGatewayConfig() as any).providers?.squad;
    const apiKey = (config?.apiKey || process.env.SQUAD_API_KEY || '').trim();
    const secretKey = (config?.secretKey || process.env.SQUAD_SECRET_KEY || '').trim();
    const mode = (config?.mode || (secretKey.includes('sandbox') ? 'test' : 'live')) as 'test' | 'live';
    const defaultUrl = mode === 'live' ? 'https://api.squadco.com' : 'https://sandbox-api-d.squadco.com';
    const baseUrl = (config?.baseUrl || process.env.SQUAD_BASE_URL || defaultUrl).trim().replace(/\/$/, '');
    const enabled = Boolean(config?.enabled && (secretKey || apiKey));

    return {
      apiKey,
      secretKey,
      baseUrl,
      mode,
      isLive: mode === 'live',
      enabled
    };
  }

  public async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const { secretKey, baseUrl, enabled } = this.getCredentials();

    if (!enabled || !secretKey) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: 'Squad gateway is not enabled or credentials are missing.'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/transaction/initiate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100), // in kobo
          email: params.email,
          currency: 'NGN',
          initiate_type: 'inline',
          transaction_ref: params.reference,
          customer_name: params.name || params.email.split('@')[0],
          callback_url: params.callbackUrl,
          pass_charge: false,
          metadata: {
            service: 'WALLET_FUNDING',
            ...params.metadata
          }
        })
      });

      const data = await response.json();

      if (response.ok && (data.status === 200 || data.success) && data.data) {
        return {
          success: true,
          reference: params.reference,
          provider: this.providerId,
          authorizationUrl: data.data.checkout_url,
          checkoutUrl: data.data.checkout_url,
          accessCode: data.data.access_code || data.data.transaction_ref,
          providerReference: data.data.transaction_ref,
          message: 'Squad checkout initialized successfully',
          raw: data.data
        };
      }

      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: data.message || 'Failed to initialize payment with Squad'
      };
    } catch (err: any) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: err.message || 'Network error communicating with Squad'
      };
    }
  }

  public async verifyPayment(reference: string): Promise<PaymentVerifyResult> {
    const { secretKey, baseUrl } = this.getCredentials();

    if (!secretKey) {
      return {
        success: false,
        verified: false,
        provider: this.providerId,
        reference,
        amount: 0,
        currency: 'NGN',
        status: 'FAILED',
        message: 'Squad secret key is not configured.'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && (data.status === 200 || data.success) && data.data) {
        const item = data.data;
        const status = (item.transaction_status || '').toLowerCase();
        const isSuccess = status === 'success';
        const amountNaira = (item.transaction_amount || 0) / 100;
        const feeNaira = (item.fee || 0) / 100;

        return {
          success: isSuccess,
          verified: isSuccess,
          provider: this.providerId,
          reference: item.transaction_ref || reference,
          providerTransactionId: item.transaction_ref,
          amount: amountNaira,
          fee: feeNaira,
          netAmount: Math.max(0, amountNaira - feeNaira),
          currency: item.currency || 'NGN',
          channel: item.payment_method || 'card',
          paidAt: item.created_at,
          customerEmail: item.email,
          status: isSuccess ? 'SUCCESS' : (status === 'pending' ? 'PENDING' : 'FAILED'),
          message: isSuccess ? 'Squad payment verified successfully' : `Squad payment status: ${status}`,
          raw: item
        };
      }

      return {
        success: false,
        verified: false,
        provider: this.providerId,
        reference,
        amount: 0,
        currency: 'NGN',
        status: 'FAILED',
        message: data.message || 'Transaction could not be verified by Squad',
        raw: data
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
        message: err.message || 'Error communicating with Squad verification API'
      };
    }
  }

  public async createCustomerVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    const { secretKey, baseUrl } = this.getCredentials();

    if (!secretKey) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'UNAVAILABLE',
        message: 'Squad credentials not configured'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/virtual-accounts/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: customer.firstName,
          last_name: customer.lastName,
          email: customer.email,
          mobile_num: customer.phone,
          bvn: customer.bvn
        })
      });

      const data = await response.json();
      if (response.ok && (data.status === 200 || data.success) && data.data) {
        return {
          success: true,
          supported: true,
          provider: this.providerId,
          accountNumber: data.data.virtual_account_number,
          accountName: data.data.account_name,
          bankName: data.data.bank_name || 'GTBank / Squad',
          reference: data.data.customer_identifier,
          status: 'ACTIVE',
          message: 'Squad virtual account created'
        };
      }

      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'FAILED',
        message: data.message || 'Failed to create Squad virtual account'
      };
    } catch (err: any) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'FAILED',
        message: err.message || 'Network error creating Squad account'
      };
    }
  }

  public async getVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    return this.createCustomerVirtualAccount(customer);
  }

  public async handleWebhook(payload: any, headers?: Record<string, string | string[]>): Promise<WebhookProcessResult> {
    const { secretKey } = this.getCredentials();

    const signature = headers?.['x-squad-encrypted-body'] || headers?.['x-squad-signature'] || headers?.['x-signature'];
    const sigString = Array.isArray(signature) ? signature[0] : signature;

    let verified = false;
    if (sigString && secretKey) {
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const hash = crypto.createHmac('sha512', secretKey).update(rawPayload).digest('hex');
      verified = hash.toLowerCase() === sigString.toLowerCase();
    }

    if (secretKey && (!sigString || !verified)) {
      return {
        handled: false,
        verified: false,
        eventType: 'signature_mismatch',
        status: 'FAILED',
        message: 'Invalid or missing Squad webhook signature'
      };
    }

    const dataObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const event = dataObj?.event || dataObj?.Event;
    const body = dataObj?.Body || dataObj?.data || dataObj;

    const reference = body?.transaction_ref || body?.reference;
    const amountNaira = (body?.amount || 0) / 100;
    const feeNaira = (body?.fee || 0) / 100;
    const isSuccess = body?.transaction_status === 'success' || event === 'charge_successful';

    return {
      handled: true,
      verified,
      eventType: event || 'charge',
      reference,
      providerTransactionId: body?.transaction_ref,
      amount: amountNaira,
      fee: feeNaira,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      isVirtualAccountDeposit: Boolean(body?.virtual_account_number),
      virtualAccountNumber: body?.virtual_account_number,
      customerEmail: body?.email,
      message: isSuccess ? 'Squad webhook verified and processed' : 'Squad webhook charge failed',
      raw: dataObj
    };
  }

  public async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    const res = await this.verifyPayment(reference);
    const mappedStatus = res.status === 'SUCCESS' ? 'SUCCESS' : (res.status === 'PENDING' ? 'PENDING' : 'FAILED');
    return {
      provider: this.providerId,
      reference,
      providerTransactionId: res.providerTransactionId,
      status: mappedStatus,
      amount: res.amount,
      message: res.message,
      raw: res.raw
    };
  }

  public async refundPayment(reference: string, amount?: number): Promise<RefundResult> {
    const { secretKey, baseUrl } = this.getCredentials();

    if (!secretKey) {
      return {
        success: false,
        reference,
        status: 'FAILED',
        message: 'Squad secret key is not configured'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/transaction/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction_ref: reference,
          refund_amount: amount ? Math.round(amount * 100) : undefined
        })
      });
      const data = await response.json();
      return {
        success: response.ok && (data.status === 200 || data.success),
        reference,
        refundId: data.data?.refund_id,
        status: response.ok ? 'PROCESSED' : 'FAILED',
        message: data.message || 'Refund request processed',
        raw: data
      };
    } catch (err: any) {
      return {
        success: false,
        reference,
        status: 'FAILED',
        message: err.message || 'Network error processing Squad refund'
      };
    }
  }

  public async getProviderBalance(): Promise<ProviderBalanceResult> {
    const { secretKey, baseUrl } = this.getCredentials();
    if (!secretKey) {
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/merchant/balance`, {
        headers: { 'Authorization': `Bearer ${secretKey}` }
      });
      const data = await response.json();
      if (response.ok && (data.status === 200 || data.success) && data.data) {
        return {
          provider: this.providerId,
          availableBalance: (data.data.balance || 0) / 100,
          currency: 'NGN',
          raw: data.data
        };
      }
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN',
        raw: data
      };
    } catch {
      return {
        provider: this.providerId,
        availableBalance: 0,
        currency: 'NGN'
      };
    }
  }

  public async testConnection(): Promise<TestConnectionResult> {
    const { secretKey, mode, baseUrl } = this.getCredentials();

    if (!secretKey) {
      return {
        success: false,
        provider: this.providerId,
        mode,
        message: 'Squad Secret Key / API Token is missing. Please enter your Squad credentials.'
      };
    }

    try {
      const response = await fetch(`${baseUrl}/merchant/account-lookup`, {
        headers: { 'Authorization': `Bearer ${secretKey}` }
      });
      const data = await response.json();

      if (response.ok && (data.status === 200 || data.success)) {
        return {
          success: true,
          provider: this.providerId,
          mode,
          message: `Successfully connected to Squad (${mode.toUpperCase()} mode). Merchant: ${data.data?.merchant_name || 'Active'}`,
          details: data.data
        };
      }

      return {
        success: false,
        provider: this.providerId,
        mode,
        message: data.message || `Squad authentication failed (Status ${response.status}). Check your Secret Key.`
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.providerId,
        mode,
        message: `Connection to Squad failed: ${err.message || 'Network error'}`
      };
    }
  }
}
