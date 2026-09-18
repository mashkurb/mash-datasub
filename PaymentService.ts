import { db, PaymentTransaction, User } from '../db.js';
import {
  PaymentGateway,
  PaymentProviderId,
  PaymentInitResult,
  PaymentVerifyResult,
  VirtualAccountResult,
  WebhookProcessResult,
  TestConnectionResult,
  ProviderBalanceResult
} from './types.js';
import { PaystackProvider } from './providers/PaystackProvider.js';
import { MonnifyProvider } from './providers/MonnifyProvider.js';
import { SquadProvider } from './providers/SquadProvider.js';

export class PaymentService {
  private providers: Map<PaymentProviderId, PaymentGateway> = new Map();

  constructor() {
    this.registerProvider(new PaystackProvider());
    this.registerProvider(new SquadProvider());
    this.registerProvider(new MonnifyProvider());
  }

  private registerProvider(provider: PaymentGateway) {
    this.providers.set(provider.providerId, provider);
  }

  public getProvider(id: string): PaymentGateway | undefined {
    const cleanId = (id || '').toUpperCase() as PaymentProviderId;
    return this.providers.get(cleanId);
  }

  public getActiveProvider(): PaymentGateway {
    const config = db.getPaymentGatewayConfig();
    const activeId = (config.activeProvider || 'PAYSTACK').toUpperCase();
    const provider = this.getProvider(activeId);
    if (!provider) {
      return this.providers.get('PAYSTACK')!;
    }
    return provider;
  }

  public getBackupProvider(): PaymentGateway | null {
    const config = db.getPaymentGatewayConfig();
    const backupId = config.backupProvider;
    if (!backupId || backupId === 'NONE' || backupId === config.activeProvider) {
      return null;
    }
    return this.getProvider(backupId) || null;
  }

  public getAllProviders(): PaymentGateway[] {
    return Array.from(this.providers.values());
  }

  public getPublicConfig() {
    const config = db.getPaymentGatewayConfig();
    const active = this.getActiveProvider();
    const backup = this.getBackupProvider();

    return {
      activeProvider: active.providerId,
      activeProviderName: active.name,
      backupProvider: backup ? backup.providerId : 'NONE',
      backupProviderName: backup ? backup.name : 'None',
      environment: config.environment,
      virtualAccountsEnabled: config.virtualAccountsEnabled,
      capabilities: active.capabilities,
      providers: this.getAllProviders().map(p => ({
        id: p.providerId,
        name: p.name,
        capabilities: p.capabilities,
        enabled: (config.providers as any)?.[p.providerId.toLowerCase()]?.enabled ?? true
      }))
    };
  }

  // ==================== WALLET FUNDING INITIALIZATION ====================
  public async initializeWalletFunding(
    user: User,
    amount: number,
    options?: { callbackUrl?: string; channel?: string }
  ): Promise<PaymentInitResult> {
    if (amount < 100) {
      return {
        success: false,
        reference: '',
        provider: 'PAYSTACK',
        message: 'Minimum funding amount is ₦100.'
      };
    }

    const activeProvider = this.getActiveProvider();
    const reference = `MDS-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const customerName = user.fullName || user.name || 'Customer';

    // Record internal payment transaction
    const paymentTx = db.createPaymentTransaction({
      customerId: user.id,
      customerEmail: user.email,
      customerName,
      provider: activeProvider.providerId,
      reference,
      amount,
      providerFee: 0,
      netAmount: amount,
      currency: 'NGN',
      status: 'PENDING',
      paymentMethod: options?.channel || 'card_bank_transfer',
      metadata: {
        userId: user.id,
        userPhone: user.phone,
        initiatingProvider: activeProvider.providerId
      }
    });

    // Attempt initialization with active provider
    let result = await activeProvider.initializePayment({
      reference,
      amount,
      email: user.email,
      name: customerName,
      phone: user.phone,
      callbackUrl: options?.callbackUrl,
      channels: options?.channel ? [options.channel] : undefined,
      metadata: {
        paymentTransactionId: paymentTx.id,
        userId: user.id
      }
    });

    // If active failed and backup provider is configured, attempt fallback
    const backupProvider = this.getBackupProvider();
    if (!result.success && backupProvider) {
      console.warn(`[PaymentService] Primary provider ${activeProvider.name} failed (${result.message}). Attempting backup provider ${backupProvider.name}...`);
      
      const backupResult = await backupProvider.initializePayment({
        reference,
        amount,
        email: user.email,
        name: customerName,
        phone: user.phone,
        callbackUrl: options?.callbackUrl,
        channels: options?.channel ? [options.channel] : undefined,
        metadata: {
          paymentTransactionId: paymentTx.id,
          userId: user.id,
          fallbackFrom: activeProvider.providerId
        }
      });

      if (backupResult.success) {
        db.updatePaymentTransaction(paymentTx.id, {
          provider: backupProvider.providerId,
          authorizationUrl: backupResult.authorizationUrl,
          checkoutUrl: backupResult.checkoutUrl,
          metadata: {
            ...(paymentTx.metadata || {}),
            fallbackUsed: true,
            originalProvider: activeProvider.providerId
          }
        });
        db.addAuditLog(user.email, 'PAYMENT_FALLBACK_TRIGGERED', `Switched from ${activeProvider.name} to backup ${backupProvider.name} for ref ${reference}`);
        return backupResult;
      }
    }

    if (result.success) {
      db.updatePaymentTransaction(paymentTx.id, {
        authorizationUrl: result.authorizationUrl,
        checkoutUrl: result.checkoutUrl
      });
    } else {
      db.updatePaymentTransaction(paymentTx.id, {
        status: 'FAILED',
        failureReason: result.message
      });
    }

    return result;
  }

  // ==================== WALLET FUNDING VERIFICATION ====================
  public async verifyWalletFunding(
    reference: string,
    options?: { transactionId?: string; providerOverride?: string }
  ): Promise<PaymentVerifyResult> {
    const cleanRef = reference.trim();
    const existingTx = db.findPaymentTransactionByReference(cleanRef) ||
                       (options?.transactionId ? db.findPaymentTransactionByProviderId(options.transactionId) : undefined);

    // If already verified and marked SUCCESS, return idempotent confirmation
    if (existingTx && existingTx.status === 'SUCCESS') {
      return {
        success: true,
        verified: true,
        provider: existingTx.provider as PaymentProviderId,
        reference: existingTx.reference,
        providerTransactionId: existingTx.providerTransactionId,
        amount: existingTx.amount,
        fee: existingTx.providerFee,
        netAmount: existingTx.netAmount,
        currency: existingTx.currency,
        status: 'SUCCESS',
        message: 'Transaction already verified and wallet credited.'
      };
    }

    // Determine which provider originated this payment
    let targetProviderId: PaymentProviderId;
    if (existingTx?.provider) {
      targetProviderId = (existingTx.provider as string).toUpperCase() as PaymentProviderId;
    } else if (options?.providerOverride) {
      targetProviderId = options.providerOverride.toUpperCase() as PaymentProviderId;
    } else {
      targetProviderId = this.getActiveProvider().providerId;
    }

    const provider = this.getProvider(targetProviderId) || this.getActiveProvider();
    const verifyResult = await provider.verifyPayment(cleanRef, options);

    if (verifyResult.verified && verifyResult.status === 'SUCCESS') {
      // Find the user to credit
      let user: User | undefined;
      if (existingTx?.customerId) {
        user = db.getUserById(existingTx.customerId);
      }
      if (!user && verifyResult.customerEmail) {
        user = db.getUserByEmail(verifyResult.customerEmail);
      }

      if (!user) {
        return {
          ...verifyResult,
          status: 'FAILED',
          message: 'Payment verified with provider, but matching customer account was not found.'
        };
      }

      const amountToCredit = verifyResult.amount;

      // ATOMIC WALLET BALANCE UPDATE with idempotency check
      const atomicResult = db.atomicUpdateBalance(user.id, amountToCredit);

      if (!atomicResult.success) {
        return {
          ...verifyResult,
          status: 'FAILED',
          message: atomicResult.error || 'Failed to update user wallet balance.'
        };
      }

      const customerName = user.fullName || user.name || 'Customer';

      // Record wallet transaction history
      db.createTransaction({
        userId: user.id,
        userName: customerName,
        userEmail: user.email,
        service: 'WALLET_FUNDING',
        amount: amountToCredit,
        previousBalance: atomicResult.previousBalance,
        newBalance: atomicResult.newBalance,
        status: 'Successful',
        reference: cleanRef,
        description: `Wallet funded with ₦${amountToCredit.toLocaleString()} via ${provider.name}`,
        metadata: {
          provider: provider.providerId,
          providerTransactionId: verifyResult.providerTransactionId,
          channel: verifyResult.channel
        }
      });

      // Update payment transaction record
      if (existingTx) {
        db.updatePaymentTransaction(existingTx.id, {
          status: 'SUCCESS',
          providerTransactionId: verifyResult.providerTransactionId,
          providerFee: verifyResult.fee || 0,
          netAmount: verifyResult.netAmount || amountToCredit,
          verifiedAt: new Date().toISOString(),
          paidAt: verifyResult.paidAt || new Date().toISOString(),
          channel: verifyResult.channel
        });
      } else {
        db.createPaymentTransaction({
          customerId: user.id,
          customerEmail: user.email,
          customerName,
          provider: provider.providerId,
          providerTransactionId: verifyResult.providerTransactionId,
          reference: cleanRef,
          amount: amountToCredit,
          providerFee: verifyResult.fee || 0,
          netAmount: verifyResult.netAmount || amountToCredit,
          currency: verifyResult.currency || 'NGN',
          status: 'SUCCESS',
          paymentMethod: verifyResult.channel,
          verifiedAt: new Date().toISOString(),
          paidAt: verifyResult.paidAt || new Date().toISOString()
        });
      }

      db.addAuditLog(
        user.email,
        'PAYMENT_VERIFIED_SUCCESS',
        `₦${amountToCredit.toLocaleString()} credited to ${user.email} via ${provider.name} (Ref: ${cleanRef})`
      );

      return verifyResult;
    } else {
      // Payment verification failed or pending
      if (existingTx) {
        db.updatePaymentTransaction(existingTx.id, {
          status: verifyResult.status === 'FAILED' ? 'FAILED' : 'PENDING',
          failureReason: verifyResult.message
        });
      }
      return verifyResult;
    }
  }

  // ==================== WEBHOOK PROCESSING ====================
  public async processWebhook(
    providerId: string,
    payload: any,
    headers?: Record<string, string | string[]>
  ): Promise<{ status: number; body: any }> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      console.warn(`[PaymentService] Webhook received for unknown provider: ${providerId}`);
      return { status: 400, body: { success: false, message: `Unknown provider: ${providerId}` } };
    }

    const webhookResult: WebhookProcessResult = await provider.handleWebhook(payload, headers);

    if (webhookResult.status === 'FAILED') {
      return { status: 400, body: { success: false, message: webhookResult.message } };
    }

    const refOrId = webhookResult.reference || webhookResult.providerTransactionId || `wh_${Date.now()}`;
    const alreadyProcessed = db.isWebhookEventProcessed(provider.providerId, refOrId);

    if (alreadyProcessed) {
      console.log(`[PaymentService] Duplicate webhook event skipped for ${provider.name} (Ref: ${refOrId})`);
      return { status: 200, body: { status: 'success', message: 'Event already processed' } };
    }

    db.recordWebhookEvent({
      provider: provider.providerId,
      eventType: webhookResult.eventType,
      reference: webhookResult.reference,
      providerTransactionId: webhookResult.providerTransactionId,
      processed: webhookResult.status === 'SUCCESS',
      status: webhookResult.status === 'SUCCESS' ? 'SUCCESS' : (webhookResult.status === 'IGNORED' ? 'IGNORED' : 'FAILED'),
      payload: typeof payload === 'object' ? payload : { raw: payload }
    });

    if (webhookResult.status === 'SUCCESS' && webhookResult.reference) {
      // Handle dedicated virtual account funding or standard online funding
      if (webhookResult.isVirtualAccountDeposit && webhookResult.virtualAccountNumber) {
        const dva = db.getDedicatedVirtualAccountByAccountNumber(webhookResult.virtualAccountNumber);
        if (dva && webhookResult.amount && webhookResult.amount > 0) {
          const user = db.getUserById(dva.userId);
          if (user) {
            const amount = webhookResult.amount;
            const atomicRes = db.atomicUpdateBalance(user.id, amount);

            if (atomicRes.success) {
              db.recordDvaFunding(dva.accountNumber, amount, webhookResult.reference);
              const customerName = user.fullName || user.name || 'Customer';
              db.createTransaction({
                userId: user.id,
                userName: customerName,
                userEmail: user.email,
                service: 'WALLET_FUNDING',
                amount,
                previousBalance: atomicRes.previousBalance,
                newBalance: atomicRes.newBalance,
                status: 'Successful',
                reference: webhookResult.reference,
                description: `Bank transfer received via ${dva.bankName} (${dva.accountNumber})`,
                metadata: {
                  provider: provider.providerId,
                  dvaAccount: dva.accountNumber
                }
              });
              db.addAuditLog(
                user.email,
                'DVA_FUNDING_CREDITED',
                `₦${amount.toLocaleString()} deposited via ${dva.bankName} DVA (${dva.accountNumber})`
              );
            }
          }
        }
      } else {
        // Standard checkout payment verification via webhook
        await this.verifyWalletFunding(webhookResult.reference, {
          transactionId: webhookResult.providerTransactionId,
          providerOverride: provider.providerId
        });
      }
    }

    return { status: 200, body: { status: 'success', message: 'Webhook received and processed' } };
  }

  // ==================== VIRTUAL ACCOUNT RESOLUTION ====================
  public async getCustomerVirtualAccount(user: User): Promise<VirtualAccountResult> {
    const config = db.getPaymentGatewayConfig();
    const activeProvider = this.getActiveProvider();

    if (!config.virtualAccountsEnabled) {
      return {
        success: false,
        supported: false,
        provider: activeProvider.providerId,
        status: 'UNAVAILABLE',
        message: 'Dedicated account number is currently unavailable. You can fund your wallet using the available payment methods.'
      };
    }

    if (!activeProvider.capabilities.supportsDedicatedVirtualAccounts) {
      return {
        success: false,
        supported: false,
        provider: activeProvider.providerId,
        status: 'UNAVAILABLE',
        message: 'Dedicated account number is currently unavailable. You can fund your wallet using the available payment methods.'
      };
    }

    // Check if customer already has a provisioned DVA for the current active provider
    const existing = db.getDedicatedVirtualAccount(user.id);
    if (existing && existing.provider === activeProvider.providerId && existing.accountNumber) {
      return {
        success: true,
        supported: true,
        provider: activeProvider.providerId,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
        bankName: existing.bankName,
        status: existing.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
        message: 'Active dedicated account retrieved'
      };
    }

    // Request generation from active provider
    const [firstName = '', ...lastNameParts] = (user.fullName || user.name || '').trim().split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    const result = await activeProvider.getVirtualAccount({
      userId: user.id,
      email: user.email,
      firstName,
      lastName,
      phone: user.phone
    });

    if (result.success && result.accountNumber) {
      const customerName = user.fullName || user.name || `${firstName} ${lastName}`.trim();
      db.saveDedicatedVirtualAccount({
        id: `dva_${user.id}_${activeProvider.providerId.toLowerCase()}`,
        userId: user.id,
        userName: customerName,
        userEmail: user.email,
        userPhone: user.phone,
        accountNumber: result.accountNumber,
        accountName: result.accountName || customerName,
        bankName: result.bankName || 'Partner Bank',
        provider: activeProvider.providerId as any,
        status: 'ACTIVE',
        totalReceived: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return result;
  }

  // ==================== ADMIN OVERVIEW & HEALTH METRICS ====================
  public async getAdminOverview() {
    const config = db.getPaymentGatewayConfig();
    const active = this.getActiveProvider();
    const backup = this.getBackupProvider();
    const allProviders = this.getAllProviders();

    // Fetch connection status for each provider
    const providerStatuses = await Promise.all(
      allProviders.map(async p => {
        const pConfig = (config.providers as any)?.[p.providerId.toLowerCase()];
        const isConfigured = !!(pConfig?.secretKey || pConfig?.apiKey);
        let balance: ProviderBalanceResult | null = null;
        if (isConfigured && pConfig?.enabled) {
          try {
            balance = await (p.getProviderBalance ? p.getProviderBalance() : Promise.resolve(null));
          } catch {
            balance = null;
          }
        }
        return {
          id: p.providerId,
          name: p.name,
          isActive: p.providerId === active.providerId,
          isBackup: backup ? p.providerId === backup.providerId : false,
          enabled: pConfig?.enabled ?? false,
          mode: pConfig?.mode || config.environment,
          configured: isConfigured,
          virtualAccountsEnabled: pConfig?.virtualAccountsEnabled ?? false,
          capabilities: p.capabilities,
          balance: balance ? balance.availableBalance : 0,
          currency: balance?.currency || 'NGN'
        };
      })
    );

    const paymentTxs = db.getPaymentTransactions();
    const webhookEvents = db.getWebhookEvents(20);

    const successfulTxs = paymentTxs.filter(t => t.status === 'SUCCESS');
    const pendingTxs = paymentTxs.filter(t => t.status === 'PENDING');
    const failedTxs = paymentTxs.filter(t => t.status === 'FAILED');

    const totalProcessedAmount = successfulTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalFees = successfulTxs.reduce((sum, t) => sum + (t.providerFee || 0), 0);
    const totalCredited = successfulTxs.reduce((sum, t) => sum + (t.netAmount || t.amount || 0), 0);

    return {
      activeProvider: active.providerId,
      activeProviderName: active.name,
      backupProvider: backup ? backup.providerId : 'NONE',
      backupProviderName: backup ? backup.name : 'None',
      environment: config.environment,
      virtualAccountsEnabled: config.virtualAccountsEnabled,
      providers: providerStatuses,
      stats: {
        totalTransactions: paymentTxs.length,
        successfulCount: successfulTxs.length,
        pendingCount: pendingTxs.length,
        failedCount: failedTxs.length,
        totalProcessedAmount,
        totalFees,
        totalCredited
      },
      recentTransactions: paymentTxs.slice(0, 50),
      recentWebhooks: webhookEvents
    };
  }

  public async testProviderConnection(providerId: string): Promise<TestConnectionResult> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return {
        success: false,
        provider: 'PAYSTACK',
        mode: 'test',
        message: `Provider ${providerId} is not recognized.`
      };
    }
    return provider.testConnection();
  }
}

export const paymentService = new PaymentService();
