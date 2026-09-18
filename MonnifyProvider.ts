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

export class MonnifyProvider implements PaymentGateway {
  public readonly name = 'Monnify';
  public readonly providerId: PaymentProviderId = 'MONNIFY';
  public readonly capabilities: GatewayCapabilities = {
    supportsDedicatedVirtualAccounts: true,
    supportsDynamicVirtualAccounts: true,
    supportsCheckout: true,
    supportsBankTransfer: true,
    supportsRefunds: false,
    supportsPayouts: true
  };

  private getCredentials() {
    const config = db.getPaymentGatewayConfig().providers.monnify;
    const apiKey = (config?.apiKey || process.env.MONNIFY_API_KEY || '').trim();
    const secretKey = (config?.secretKey || process.env.MONNIFY_SECRET_KEY || '').trim();
    const contractCode = (config?.contractCode || process.env.MONNIFY_CONTRACT_CODE || '').trim();
    const baseUrl = (config?.baseUrl || process.env.MONNIFY_BASE_URL || 'https://api.monnify.com').replace(/\/$/, '');
    const isLive = config?.mode === 'live' || !baseUrl.includes('sandbox');
    return {
      apiKey,
      secretKey,
      contractCode,
      baseUrl,
      isLive,
      enabled: Boolean(config?.enabled && apiKey && secretKey && contractCode)
    };
  }

  // Official Monnify OAuth2 Basic Auth login
  private async getAccessToken(): Promise<string | null> {
    const { apiKey, secretKey, baseUrl } = this.getCredentials();
    if (!apiKey || !secretKey) return null;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (response.ok && data?.requestSuccessful && data?.responseBody?.accessToken) {
        return data.responseBody.accessToken;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const { apiKey, secretKey, contractCode, baseUrl, enabled } = this.getCredentials();

    if (!enabled) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: 'Monnify payment provider is currently pending setup or disabled by administrator.'
      };
    }

    if (!apiKey || !secretKey || !contractCode) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: 'Monnify live credentials (API Key, Secret Key, Contract Code) are not configured.'
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return {
          success: false,
          reference: params.reference,
          provider: this.providerId,
          message: 'Failed to authenticate with Monnify API. Please verify your credentials.'
        };
      }

      const payload = {
        amount: params.amount,
        customerName: params.name || 'Mash Customer',
        customerEmail: params.email,
        paymentReference: params.reference,
        paymentDescription: 'Mash DataSub Wallet Funding',
        currencyCode: 'NGN',
        contractCode: contractCode,
        redirectUrl: params.callbackUrl,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
        metaData: {
          customerPhone: params.phone,
          ...(params.metadata || {})
        }
      };

      const response = await fetch(`${baseUrl}/api/v1/merchant/transactions/init-transaction`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.requestSuccessful) {
        return {
          success: false,
          reference: params.reference,
          provider: this.providerId,
          message: data.responseMessage || 'Failed to initialize Monnify transaction',
          raw: data
        };
      }

      const body = data.responseBody;
      return {
        success: true,
        reference: params.reference,
        provider: this.providerId,
        authorizationUrl: body.checkoutUrl,
        checkoutUrl: body.checkoutUrl,
        providerReference: body.transactionReference,
        message: 'Monnify checkout initialized successfully',
        raw: body
      };
    } catch (err: any) {
      return {
        success: false,
        reference: params.reference,
        provider: this.providerId,
        message: err.message || 'Network error communicating with Monnify'
      };
    }
  }

  public async verifyPayment(reference: string): Promise<PaymentVerifyResult> {
    const { baseUrl, enabled, apiKey, secretKey } = this.getCredentials();

    if (!apiKey || !secretKey) {
      return {
        success: false,
        verified: false,
        provider: this.providerId,
        reference,
        amount: 0,
        currency: 'NGN',
        status: 'FAILED',
        message: 'Monnify credentials are not configured.'
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return {
          success: false,
          verified: false,
          provider: this.providerId,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'FAILED',
          message: 'Unable to authenticate with Monnify API.'
        };
      }

      const cleanRef = encodeURIComponent(reference.trim());
      const response = await fetch(`${baseUrl}/api/v2/transactions/${cleanRef}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok || !data.requestSuccessful || !data.responseBody) {
        return {
          success: false,
          verified: false,
          provider: this.providerId,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'FAILED',
          message: data.responseMessage || 'Could not verify transaction with Monnify',
          raw: data
        };
      }

      const body = data.responseBody;
      const isPaid = body.paymentStatus === 'PAID' || body.paymentStatus === 'OVERPAID';
      const isFailed = body.paymentStatus === 'FAILED' || body.paymentStatus === 'EXPIRED';

      return {
        success: true,
        verified: isPaid,
        provider: this.providerId,
        reference: body.paymentReference || reference,
        providerTransactionId: body.transactionReference,
        amount: Number(body.amountPaid || body.amount || 0),
        fee: Number(body.fee || 0),
        netAmount: Number(body.payableAmount || body.amountPaid || 0),
        currency: body.currencyCode || 'NGN',
        channel: body.paymentMethod || 'monnify_transfer',
        paidAt: body.completedTimestamp,
        customerEmail: body.customer?.email,
        status: isPaid ? 'SUCCESS' : isFailed ? 'FAILED' : 'PENDING',
        message: isPaid ? 'Payment verified successfully' : `Transaction status: ${body.paymentStatus}`,
        raw: body
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
        message: err.message || 'Error communicating with Monnify verification API'
      };
    }
  }

  public async createCustomerVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    const { contractCode, baseUrl, enabled } = this.getCredentials();

    if (!enabled) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'UNAVAILABLE',
        message: 'Monnify is pending setup or disabled.'
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return {
          success: false,
          supported: true,
          provider: this.providerId,
          status: 'FAILED',
          message: 'Unable to authenticate with Monnify for virtual account creation'
        };
      }

      const accountRef = `MDS-VA-${customer.userId}-${Date.now()}`;
      const payload = {
        accountReference: accountRef,
        accountName: `Mash - ${customer.firstName} ${customer.lastName}`.trim(),
        currencyCode: 'NGN',
        contractCode: contractCode,
        customerEmail: customer.email,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        getAllAvailableBanks: true
      };

      const response = await fetch(`${baseUrl}/api/v2/bank-transfer/reserved-accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.requestSuccessful || !data.responseBody) {
        return {
          success: false,
          supported: true,
          provider: this.providerId,
          status: 'FAILED',
          message: data.responseMessage || 'Failed to create Monnify reserved virtual account',
          raw: data
        };
      }

      const body = data.responseBody;
      const firstBank = body.accounts?.[0];

      if (firstBank && firstBank.accountNumber) {
        return {
          success: true,
          supported: true,
          provider: this.providerId,
          accountNumber: firstBank.accountNumber,
          accountName: body.accountName || `${customer.firstName} ${customer.lastName}`,
          bankName: firstBank.bankName || 'Wema Bank',
          bankCode: firstBank.bankCode,
          reference: body.accountReference,
          status: 'ACTIVE',
          message: 'Dedicated virtual account created successfully',
          raw: body
        };
      }

      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'PENDING',
        message: 'Virtual account request registered, awaiting bank allocation',
        raw: body
      };
    } catch (err: any) {
      return {
        success: false,
        supported: true,
        provider: this.providerId,
        status: 'FAILED',
        message: err.message || 'Error creating Monnify virtual account'
      };
    }
  }

  public async getVirtualAccount(customer: CustomerVirtualAccountParams): Promise<VirtualAccountResult> {
    const existing = db.findDedicatedVirtualAccountByUserId(customer.userId);
    if (existing && existing.provider === 'MONNIFY' && existing.accountNumber) {
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

    // Official Monnify webhook signature validation
    const signature = headers?.['monnify-signature'] || headers?.['Monnify-Signature'];
    const sigString = Array.isArray(signature) ? signature[0] : signature;

    let verified = false;
    if (sigString && secretKey) {
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      // Monnify computes SHA-512 of secretKey + rawRequestBody
      const hash = crypto.createHash('sha512').update(secretKey + rawPayload).digest('hex');
      verified = hash.toLowerCase() === sigString.toLowerCase();
    }

    const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const eventType = eventData.eventType || 'TRANSACTION_NOTIFICATION';
    const eventBody = eventData.eventData || eventData;

    const isSuccess = eventBody.paymentStatus === 'PAID';
    const reference = eventBody.paymentReference || eventBody.transactionReference;
    const amount = Number(eventBody.amountPaid || eventBody.amount || 0);

    return {
      handled: true,
      verified,
      eventType,
      reference,
      providerTransactionId: eventBody.transactionReference,
      amount,
      fee: Number(eventBody.fee || 0),
      customerEmail: eventBody.customer?.email,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      isVirtualAccountDeposit: Boolean(eventBody.product?.type === 'RESERVED_ACCOUNT'),
      virtualAccountNumber: eventBody.destinationAccountInformation?.accountNumber,
      message: `Monnify webhook processed: ${eventType}`,
      raw: eventData
    };
  }

  public async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    const verify = await this.verifyPayment(reference);
    return {
      provider: this.providerId,
      reference,
      providerTransactionId: verify.providerTransactionId,
      status: verify.status === 'SUCCESS' ? 'SUCCESS' : verify.status === 'FAILED' ? 'FAILED' : 'PENDING',
      amount: verify.amount,
      message: verify.message,
      raw: verify.raw
    };
  }

  public async testConnection(): Promise<TestConnectionResult> {
    const { apiKey, secretKey, contractCode, baseUrl, isLive } = this.getCredentials();

    if (!apiKey || !secretKey || !contractCode) {
      return {
        success: false,
        provider: this.providerId,
        mode: isLive ? 'live' : 'test',
        message: 'Monnify is not configured. Missing API Key, Secret Key, or Contract Code.'
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (accessToken) {
        return {
          success: true,
          provider: this.providerId,
          mode: isLive ? 'live' : 'test',
          message: 'Connection successful. Monnify authenticated successfully using official OAuth2 Basic Auth.',
          details: {
            contractCode,
            baseUrl,
            authenticated: true
          }
        };
      } else {
        return {
          success: false,
          provider: this.providerId,
          mode: isLive ? 'live' : 'test',
          message: 'Failed to authenticate with Monnify. Please verify your API Key and Secret Key.'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: this.providerId,
        mode: isLive ? 'live' : 'test',
        message: `Monnify connection error: ${err.message}`
      };
    }
  }
}
