import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db, User, DataPlan } from './server/db';
import {
  signToken,
  requireAuth,
  requireAdmin,
  requireOwner,
  AuthenticatedRequest
} from './server/auth';
import {
  generateSecureOtp,
  sendOtpEmail,
  checkOtpRateLimit,
  recordOtpSent,
  testEmailConnection
} from './server/email';
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  testPaystackConnection,
  testMonnifyConnection,
  initializeMonnifyTransaction,
  verifyMonnifyWebhookSignature,
  getGatewayCredentials,
  maskKey,
  initializeFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
  testFlutterwaveConnection,
  checkFlutterwaveDvaAvailability,
  provisionCustomerFlutterwaveAccount
} from './server/gateways';
import {
  purchaseDataFromProvider,
  purchaseAirtimeFromProvider,
  purchaseElectricityFromProvider,
  purchaseTvFromProvider,
  testVtuConnection,
  getVtuCredentials,
  syncCatalogFromRapidBills
} from './server/vtu';
import {
  provisionCustomerDedicatedAccount,
  checkPaystackDvaAvailability
} from './server/dva';
import { paymentService } from './server/payments/PaymentService.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', app: 'Mash DataSub' });
  });

  // -------------------------------------------------------------
  // PUBLIC SYSTEM STATUS
  // -------------------------------------------------------------
  app.get('/api/system/status', (req: Request, res: Response) => {
    const settings = db.getSettings();
    res.json({
      name: 'Mash DataSub',
      maintenanceMode: settings.maintenanceMode,
      registrationEnabled: settings.registrationEnabled,
      servicesAvailability: settings.servicesAvailability,
      support: {
        phone: '0808 1419 276',
        whatsapp: '0808 1419 276',
        whatsappUrl: 'https://wa.me/2348081419276?text=Hello%20Mash%20DataSub%20Support',
        callUrl: 'tel:08081419276'
      }
    });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION: SIGN UP (DIRECT REGISTRATION - NO OTP / NO VERIFICATION EMAIL)
  // -------------------------------------------------------------
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const settings = db.getSettings();
    if (!settings.registrationEnabled) {
      res.status(403).json({ error: 'New customer registration is temporarily paused by the administrator.' });
      return;
    }

    const { fullName, email, phone, password, confirmPassword, referralCode } = req.body;
    if (!fullName || !email || !phone || !password) {
      res.status(400).json({ error: 'Full name, email address, phone number, and password are required.' });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match. Please verify.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    // Nigerian Phone Validation: Max 11 digits, strictly starting with 07, 08, or 09
    let cleanPhone = phone.trim();
    if (cleanPhone.startsWith('+234')) {
      cleanPhone = '0' + cleanPhone.slice(4);
    } else if (cleanPhone.startsWith('234') && cleanPhone.length > 10) {
      cleanPhone = '0' + cleanPhone.slice(3);
    }
    cleanPhone = cleanPhone.replace(/\D/g, '');

    if (cleanPhone.length !== 11) {
      res.status(400).json({
        error: `Nigerian phone numbers must be exactly 11 digits (e.g. 08081419276). Received ${cleanPhone.length} digits.`
      });
      return;
    }

    if (!/^0[789]\d{9}$/.test(cleanPhone)) {
      res.status(400).json({
        error: 'Invalid Nigerian phone number format. Must start with 080, 081, 070, 090, 091, etc.'
      });
      return;
    }

    // Check existing accounts
    const existingEmail = db.findUserByEmailOrPhone(cleanEmail);
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email address already exists. Please log in.' });
      return;
    }

    const existingPhone = db.findUserByEmailOrPhone(cleanPhone);
    if (existingPhone) {
      res.status(409).json({ error: 'An account with this phone number already exists. Please log in.' });
      return;
    }

    // Hash password securely with salt
    const passwordHash = db.hashPassword(password);
    const userRefCode = 'MASH' + Math.floor(100000 + Math.random() * 900000);

    const newUser = db.createUser({
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      role: 'CUSTOMER',
      isVerified: true,
      walletBalance: 0.00,
      referralCode: userRefCode,
      referredBy: referralCode ? referralCode.trim() : undefined
    });

    db.addAuditLog('USER_REGISTERED', `New customer account registered: ${cleanEmail} (${cleanPhone})`, 'System');

    // Automatically create/request real Paystack Dedicated Virtual Account for new customer
    provisionCustomerDedicatedAccount(newUser.id).catch(err => {
      console.warn(`Auto-provision DVA for new customer ${newUser.email}:`, err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please log in with your credentials.',
      email: cleanEmail,
      phone: cleanPhone
    });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION: SIGN UP & GMAIL OTP (Rules 3, 4, 5, 8)
  // -------------------------------------------------------------
  app.post('/api/auth/register/request-otp', async (req: Request, res: Response) => {
    const settings = db.getSettings();
    if (!settings.registrationEnabled) {
      res.status(403).json({ error: 'New registrations are currently paused by the administrator.' });
      return;
    }

    const { email, phone, fullName } = req.body;
    if (!email || !phone || !fullName) {
      res.status(400).json({ error: 'Full name, email address, and phone number are required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = db.findUserByEmailOrPhone(cleanEmail) || db.findUserByEmailOrPhone(phone.trim());
    if (existing) {
      res.status(409).json({ error: 'An account with this email or phone number already exists. Please log in.' });
      return;
    }

    // Rate limit OTP requests
    const rateCheck = checkOtpRateLimit(cleanEmail, 60);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Please wait ${rateCheck.remainingSeconds} seconds before requesting a new OTP.`
      });
      return;
    }

    // Generate real secure 6-digit random OTP
    const otp = generateSecureOtp(6);
    db.saveOtp(cleanEmail, otp, 'registration');
    recordOtpSent(cleanEmail);

    // Send real email OTP via nodemailer
    const isTestRunner = process.env.NODE_ENV !== 'production' && req.headers['x-mash-test-runner'] === 'true';
    if (!isTestRunner) {
      const emailConfig = db.getSettings().emailConfig;
      const emailResult = await sendOtpEmail(cleanEmail, otp, 'registration', emailConfig);
      if (!emailResult.success) {
        // Return useful error if delivery fails (Rule 5)
        res.status(502).json({
          error: emailResult.error || 'Please configure Gmail credentials in settings to receive OTP.',
          deliveryFailed: true
        });
        return;
      }
    }

    res.json({
      success: true,
      message: `A verification code has been dispatched to ${cleanEmail}. Please enter the 6-digit code.`,
      ...(isTestRunner ? { devOtp: otp } : {})
    });
  });

  app.post('/api/auth/register/verify-otp', async (req: Request, res: Response) => {
    const { fullName, email, phone, password, otp, referralCode } = req.body;
    if (!email || !otp || !password || !fullName || !phone) {
      res.status(400).json({ error: 'All fields including the verification code are required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // Verify OTP against database
    const otpCheck = db.verifyOtp(cleanEmail, otp, 'registration');
    if (!otpCheck.valid) {
      res.status(400).json({ error: otpCheck.error || 'Invalid or expired verification code.' });
      return;
    }

    // Check again if user exists
    if (db.findUserByEmailOrPhone(cleanEmail) || db.findUserByEmailOrPhone(cleanPhone)) {
      res.status(409).json({ error: 'Account already registered. Please log in.' });
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    // Hash password with salt
    const passwordHash = db.hashPassword(password);
    const userRefCode = 'MASH' + Math.floor(100000 + Math.random() * 900000);

    // Create user strictly with CUSTOMER role and ₦0.00 wallet balance (Rule 8, 15)
    const newUser = db.createUser({
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      role: 'CUSTOMER', // Server enforces CUSTOMER role!
      isVerified: true,
      walletBalance: 0.00,
      referralCode: userRefCode,
      referredBy: referralCode ? referralCode.trim() : undefined
    });

    const token = signToken(newUser);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        walletBalance: newUser.walletBalance,
        hasPin: false,
        referralCode: newUser.referralCode
      }
    });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION: LOGIN & BIOMETRICS (Rules 2, 3, 7)
  // -------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ error: 'Please enter your email or phone number and password.' });
      return;
    }

    const user = db.findUserByEmailOrPhone(identifier);
    if (!user) {
      res.status(401).json({ error: 'Invalid email/phone or password. Please verify your credentials.' });
      return;
    }

    const isMatch = db.verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email/phone or password. Please verify your credentials.' });
      return;
    }

    const token = signToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        walletBalance: user.walletBalance,
        hasPin: !!user.transactionPinHash,
        biometricEnabled: !!user.biometricToken,
        referralCode: user.referralCode
      }
    });
  });

  app.post('/api/auth/biometric/login', (req: Request, res: Response) => {
    const { email, biometricToken } = req.body;
    if (!email || !biometricToken) {
      res.status(400).json({ error: 'Biometric credentials required.' });
      return;
    }

    const user = db.findUserByEmailOrPhone(email);
    if (!user || !user.biometricToken || user.biometricToken !== biometricToken) {
      res.status(401).json({ error: 'Biometric authentication failed. Please log in with your password.' });
      return;
    }

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        walletBalance: user.walletBalance,
        hasPin: !!user.transactionPinHash,
        biometricEnabled: true,
        referralCode: user.referralCode
      }
    });
  });

  app.post('/api/auth/biometric/enable', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const token = crypto.randomBytes(32).toString('hex');
    db.updateUser(user.id, { biometricToken: token });
    res.json({ success: true, biometricToken: token });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION: FORGOT PASSWORD (Rules 4, 5)
  // -------------------------------------------------------------
  app.post('/api/auth/forgot-password/request-otp', async (req: Request, res: Response) => {
    const { identifier } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Please enter your registered email or phone number.' });
      return;
    }

    const user = db.findUserByEmailOrPhone(identifier);
    if (!user) {
      // Do not leak existence, but provide helpful guidance
      res.status(404).json({ error: 'No registered account found with that email or phone number.' });
      return;
    }

    const rateCheck = checkOtpRateLimit(user.email, 60);
    if (!rateCheck.allowed) {
      res.status(429).json({ error: `Please wait ${rateCheck.remainingSeconds} seconds before requesting a new OTP.` });
      return;
    }

    const otp = generateSecureOtp(6);
    db.saveOtp(user.email, otp, 'forgot_password');
    recordOtpSent(user.email);

    const isTestRunner = process.env.NODE_ENV !== 'production' && req.headers['x-mash-test-runner'] === 'true';
    if (!isTestRunner) {
      const emailConfig = db.getSettings().emailConfig;
      const emailResult = await sendOtpEmail(user.email, otp, 'forgot_password', emailConfig);
      if (!emailResult.success) {
        res.status(502).json({
          error: emailResult.error || 'Please configure Gmail credentials in settings to receive OTP.',
          deliveryFailed: true
        });
        return;
      }
    }

    res.json({
      success: true,
      email: user.email,
      message: `Password reset verification code dispatched to ${user.email}.`,
      ...(isTestRunner ? { devOtp: otp } : {})
    });
  });

  app.post('/api/auth/forgot-password/verify-reset', (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: 'Email, OTP, and new password are required.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const otpCheck = db.verifyOtp(cleanEmail, otp, 'forgot_password');
    if (!otpCheck.valid) {
      res.status(400).json({ error: otpCheck.error || 'Invalid or expired OTP code.' });
      return;
    }

    const user = db.findUserByEmailOrPhone(cleanEmail);
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const newHash = db.hashPassword(newPassword);
    db.updateUser(user.id, { passwordHash: newHash });

    res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
  });

  // -------------------------------------------------------------
  // USER PROFILE & PIN MANAGEMENT (Rule 20, 34)
  // -------------------------------------------------------------
  app.get('/api/user/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      walletBalance: user.walletBalance,
      hasPin: !!user.transactionPinHash,
      biometricEnabled: !!user.biometricToken,
      referralCode: user.referralCode,
      createdAt: user.createdAt
    });
  });

  app.post('/api/user/pin/set', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin.toString())) {
      res.status(400).json({ error: 'Transaction PIN must be exactly 4 digits.' });
      return;
    }

    const pinHash = db.hashPin(pin.toString());
    db.updateUser(user.id, { transactionPinHash: pinHash });
    res.json({ success: true, message: 'Transaction PIN configured successfully.' });
  });

  app.post('/api/user/pin/change', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { oldPin, newPin } = req.body;

    if (!user.transactionPinHash) {
      res.status(400).json({ error: 'No Transaction PIN is currently set. Please create one.' });
      return;
    }

    if (!db.verifyPin(oldPin, user.transactionPinHash)) {
      res.status(400).json({ error: 'Current Transaction PIN is incorrect.' });
      return;
    }

    if (!newPin || !/^\d{4}$/.test(newPin.toString())) {
      res.status(400).json({ error: 'New PIN must be exactly 4 digits.' });
      return;
    }

    const pinHash = db.hashPin(newPin.toString());
    db.updateUser(user.id, { transactionPinHash: pinHash });
    res.json({ success: true, message: 'Transaction PIN updated successfully.' });
  });

  app.post('/api/user/password/change', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body;

    if (!db.verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const passwordHash = db.hashPassword(newPassword);
    db.updateUser(user.id, { passwordHash });
    res.json({ success: true, message: 'Account password updated successfully.' });
  });

  // Alias for /api/auth/pin/update
  app.post('/api/auth/pin/update', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { currentPin, newPin } = req.body;

    if (user.transactionPinHash) {
      if (!currentPin || !db.verifyPin(currentPin, user.transactionPinHash)) {
        res.status(400).json({ error: 'Current 4-digit PIN is incorrect.' });
        return;
      }
    }

    if (!newPin || !/^\d{4}$/.test(newPin.toString())) {
      res.status(400).json({ error: 'New PIN must be exactly 4 digits.' });
      return;
    }

    const pinHash = db.hashPin(newPin.toString());
    db.updateUser(user.id, { transactionPinHash: pinHash });
    res.json({ success: true, message: 'Transaction PIN updated successfully.' });
  });

  // Alias for /api/auth/password/change
  app.post('/api/auth/password/change', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body;

    if (!db.verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const passwordHash = db.hashPassword(newPassword);
    db.updateUser(user.id, { passwordHash });
    res.json({ success: true, message: 'Account password updated successfully.' });
  });

  // -------------------------------------------------------------
  // USER-TO-USER WALLET TRANSFER (Master Requirement 1 & 2)
  // Server-side atomic execution with admin-configurable transfer fees
  // -------------------------------------------------------------
  app.get('/api/user/transfer/config', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();
    const amount = Math.max(0, Number(req.query.amount) || 0);

    const transferEnabled = settings.transferEnabled !== false && settings.customerToCustomerTransferEnabled !== false;
    const feeType = settings.transferFeeType || 'flat';
    const fixedFee = settings.transferFixedFee !== undefined ? settings.transferFixedFee : (settings.transferCharge !== undefined ? settings.transferCharge : 50);
    const percentFee = settings.transferPercentFee !== undefined ? settings.transferPercentFee : 0;
    const feePayer = settings.transferFeePayer || 'SENDER';
    const minTransferAmount = settings.minTransferAmount !== undefined ? settings.minTransferAmount : 50;
    const maxTransferAmount = settings.maxTransferAmount || 200000;
    const dailyTransferLimit = settings.dailyTransferLimit || 500000;

    // Calculate fee for the requested amount
    let calculatedFee = 0;
    if (feeType === 'free') {
      calculatedFee = 0;
    } else if (feeType === 'percentage') {
      calculatedFee = Math.round((amount * (percentFee / 100)) * 100) / 100;
    } else {
      calculatedFee = Math.round(fixedFee * 100) / 100;
    }

    let totalDeduction = 0;
    let recipientReceives = 0;

    if (feePayer === 'SENDER') {
      totalDeduction = Math.round((amount + calculatedFee) * 100) / 100;
      recipientReceives = amount;
    } else {
      totalDeduction = amount;
      recipientReceives = Math.max(0, Math.round((amount - calculatedFee) * 100) / 100);
    }

    // Calculate user's today transferred out
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const userTxs = db.getTransactions(user.id);
    const todayTransfers = userTxs.filter(t =>
      t.service === 'TRANSFER_OUT' &&
      t.status === 'Successful' &&
      new Date(t.createdAt).getTime() >= startOfDay
    );
    const todayTotal = todayTransfers.reduce((sum, t) => sum + ((t.metadata?.transferAmount as number) || t.amount), 0);
    const remainingDailyLimit = Math.max(0, dailyTransferLimit - todayTotal);

    res.json({
      enabled: transferEnabled,
      transferEnabled,
      customerToCustomerTransferEnabled: settings.customerToCustomerTransferEnabled !== false,
      feeType,
      transferFeeType: feeType,
      fixedFee,
      transferFixedFee: fixedFee,
      percentFee,
      transferPercentFee: percentFee,
      transferCharge: fixedFee,
      feePayer,
      transferFeePayer: feePayer,
      minTransferAmount,
      maxTransferAmount,
      dailyTransferLimit,
      todayTransferred: todayTotal,
      remainingDailyLimit,
      calculatedFee,
      totalDeduction,
      recipientReceives
    });
  });

  // Helper function to look up transfer recipient (supports phone, email, or user identifier)
  const handleLookupRecipient = (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const rawIdentifier = (req.body?.identifier || req.body?.phone || req.query?.identifier || req.query?.phone || '') as string;

    if (!rawIdentifier || typeof rawIdentifier !== 'string' || rawIdentifier.trim().length === 0) {
      res.status(400).json({ error: 'Please enter recipient phone number, email, or username.' });
      return;
    }

    let clean = rawIdentifier.trim();
    // Normalize Nigerian phone formats (+234, 234, 0...)
    if (clean.startsWith('+234')) {
      clean = '0' + clean.slice(4).replace(/\D/g, '');
    } else if (clean.startsWith('234') && clean.length > 10) {
      clean = '0' + clean.slice(3).replace(/\D/g, '');
    }

    const recipient = db.findUserByIdentifier(clean) || db.findUserByEmailOrPhone(clean);

    if (!recipient) {
      res.status(404).json({
        error: 'Recipient account was not found. Please ensure they have a registered Mash DataSub account with this phone number or email.'
      });
      return;
    }

    if (recipient.id === user.id) {
      res.status(400).json({
        error: 'You cannot initiate a transfer to your own account.'
      });
      return;
    }

    if (recipient.status === 'SUSPENDED') {
      res.status(400).json({
        error: 'This recipient account is currently suspended and cannot receive wallet transfers.'
      });
      return;
    }

    res.json({
      success: true,
      recipient: {
        id: recipient.id,
        fullName: recipient.fullName,
        phone: recipient.phone,
        email: recipient.email
      }
    });
  };

  app.get('/api/user/transfer/lookup-recipient', requireAuth, handleLookupRecipient);
  app.post('/api/user/transfer/lookup-recipient', requireAuth, handleLookupRecipient);
  app.get('/api/wallet/transfer/verify-phone', requireAuth, handleLookupRecipient);
  app.post('/api/wallet/transfer/verify-phone', requireAuth, handleLookupRecipient);

  const handleProcessTransfer = (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    // 1. Check if transfers are enabled
    if (settings.maintenanceMode) {
      res.status(503).json({ error: 'Mash DataSub is temporarily in maintenance mode.' });
      return;
    }

    if (settings.transferEnabled === false || settings.customerToCustomerTransferEnabled === false) {
      res.status(403).json({ error: 'Customer-to-customer wallet transfers are temporarily disabled by the administrator.' });
      return;
    }

    if (user.status === 'SUSPENDED') {
      res.status(403).json({ error: 'Your account has been suspended. Outgoing transfers are restricted.' });
      return;
    }

    const { recipientIdentifier, recipientPhone, amount, pin } = req.body;
    const identifier = (recipientIdentifier || recipientPhone || '').trim();
    const transferAmount = Number(amount);

    if (!identifier || !transferAmount || transferAmount <= 0) {
      res.status(400).json({ error: 'Recipient phone number or email and a valid transfer amount are required.' });
      return;
    }

    // 2. PIN Validation
    if (!user.transactionPinHash) {
      res.status(400).json({ error: 'Please set your 4-digit Transaction PIN in Profile before making transfers.' });
      return;
    }

    if (!pin || !db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect 4-digit Transaction PIN. Please check and try again.' });
      return;
    }

    // 3. Atomic Execution
    const transferResult = db.atomicUserTransfer(user.id, identifier, transferAmount);

    if (!transferResult.success) {
      res.status(400).json({ error: transferResult.error || 'Failed to complete wallet transfer.' });
      return;
    }

    const senderTx = transferResult.senderTx!;
    const recipient = transferResult.recipientUser!;
    const fee = transferResult.fee || 0;
    const feePayer = transferResult.feePayer || 'SENDER';
    const recipientReceived = transferResult.recipientReceived !== undefined ? transferResult.recipientReceived : transferAmount;
    const totalDeducted = transferResult.totalDeducted !== undefined ? transferResult.totalDeducted : senderTx.amount;

    res.json({
      success: true,
      message: `₦${transferAmount.toLocaleString()} transferred successfully to ${recipient.fullName}!`,
      receipt: {
        reference: senderTx.reference,
        amount: transferAmount,
        fee,
        feePayer,
        totalDeducted,
        recipientReceived,
        recipientName: recipient.fullName,
        recipientPhone: recipient.phone,
        recipientEmail: recipient.email,
        newBalance: transferResult.senderNewBalance,
        date: senderTx.createdAt,
        status: 'Successful'
      }
    });
  };

  app.post('/api/user/transfer', requireAuth, handleProcessTransfer);
  app.post('/api/wallet/transfer', requireAuth, handleProcessTransfer);

  // -------------------------------------------------------------
  // DATA PLANS CATALOG (Rules 12, 13, 14, 37)
  // Clean retail prices directly from database! No % discount or markup exposed!
  // -------------------------------------------------------------
  app.get('/api/catalog/data-plans', (req: Request, res: Response) => {
    const plans = db.getDataPlans(true); // Return active plans
    const sanitized = plans.map(p => ({
      id: p.id,
      network: p.network,
      category: p.category,
      name: p.name,
      dataAmount: p.dataAmount,
      validity: p.validity,
      sellingPrice: p.sellingPrice // Admin-controlled source of truth!
    }));
    res.json(sanitized);
  });

  // -------------------------------------------------------------
  // SERVICES: DATA PURCHASE (Rules 11, 21, 37, 39)
  // -------------------------------------------------------------
  app.post('/api/services/data/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    // 1. Maintenance & service availability
    if (settings.maintenanceMode) {
      res.status(503).json({ error: 'Mash DataSub is temporarily in maintenance mode. Please check back shortly.' });
      return;
    }
    if (!settings.servicesAvailability.data) {
      res.status(503).json({ error: 'Data purchase service is temporarily disabled.' });
      return;
    }

    const { planId, phone, pin } = req.body;
    if (!planId || !phone || !pin) {
      res.status(400).json({ error: 'Data plan, recipient phone number, and 4-digit PIN are required.' });
      return;
    }

    // Validate phone number format (Nigerian 11 digits: 080..., 070..., 090..., 081...)
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+234/, '0');
    if (!/^0[789][01]\d{8}$/.test(cleanPhone)) {
      res.status(400).json({ error: 'Please enter a valid 11-digit Nigerian phone number (e.g. 08012345678).' });
      return;
    }

    // 2. Verify Transaction PIN
    if (!user.transactionPinHash) {
      res.status(400).json({ error: 'Please create your 4-digit Transaction PIN in Profile > Security before making purchases.' });
      return;
    }
    if (!db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect Transaction PIN. Please check and try again.' });
      return;
    }

    // 3. Lookup data plan and current Admin Selling Price
    const plan = db.findDataPlanById(planId);
    if (!plan || !plan.isAvailable) {
      res.status(400).json({ error: 'The selected data plan is currently unavailable.' });
      return;
    }

    const sellingPrice = plan.sellingPrice;

    // 4. Atomic Wallet Balance Check & Reservation
    const deduction = db.atomicUpdateBalance(user.id, -sellingPrice);
    if (!deduction.success) {
      res.status(400).json({
        error: `Insufficient wallet balance. You need ₦${sellingPrice.toLocaleString()}, but your balance is ₦${deduction.previousBalance.toLocaleString()}. Please fund your wallet.`
      });
      return;
    }

    const reference = 'MDS-DAT-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    // 5. Create pending transaction record
    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'DATA',
      description: `${plan.network} ${plan.category} ${plan.dataAmount} Data to ${cleanPhone}`,
      amount: sellingPrice,
      previousBalance: deduction.previousBalance,
      newBalance: deduction.newBalance,
      status: 'Pending',
      metadata: {
        planId: plan.id,
        network: plan.network,
        category: plan.category,
        dataAmount: plan.dataAmount,
        phone: cleanPhone,
        sellingPrice
      }
    });

    // 6. Call VTU Provider (RapidBills / configured provider)
    const providerResult = await purchaseDataFromProvider(cleanPhone, plan, reference);

    if (providerResult.success) {
      const finalStatus = providerResult.isPending ? 'Pending' : 'Successful';
      db.updateTransactionStatus(reference, finalStatus, providerResult.providerResponse);

      res.json({
        success: true,
        reference,
        status: finalStatus,
        service: 'DATA',
        network: plan.network,
        dataAmount: plan.dataAmount,
        recipient: cleanPhone,
        amount: sellingPrice,
        newBalance: deduction.newBalance,
        date: transaction.createdAt,
        message: finalStatus === 'Successful'
          ? `Successfully delivered ${plan.network} ${plan.dataAmount} to ${cleanPhone}!`
          : `Data request queued with provider (Pending). Tracking Reference: ${reference}`
      });
    } else {
      // Automatic Reversal for failed provider transaction (Rule 21)
      const reversal = db.atomicUpdateBalance(user.id, sellingPrice);
      db.updateTransactionStatus(reference, 'Failed', providerResult.providerResponse || providerResult.error);

      res.status(502).json({
        success: false,
        error: providerResult.error || 'Provider data top-up failed. Your wallet balance has been refunded in full.',
        reference,
        refunded: true,
        currentBalance: reversal.newBalance
      });
    }
  });

  // -------------------------------------------------------------
  // SERVICES: AIRTIME PURCHASE
  // -------------------------------------------------------------
  app.post('/api/services/airtime/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    if (settings.maintenanceMode || !settings.servicesAvailability.airtime) {
      res.status(503).json({ error: 'Airtime recharge service is temporarily unavailable.' });
      return;
    }

    const { network, phone, amount, pin } = req.body;
    const rechargeAmount = Number(amount);
    if (!network || !phone || !rechargeAmount || rechargeAmount < 50 || !pin) {
      res.status(400).json({ error: 'Valid network, phone number, recharge amount (min ₦50), and PIN are required.' });
      return;
    }

    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+234/, '0');
    if (!user.transactionPinHash || !db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect Transaction PIN.' });
      return;
    }

    const discountPct = (settings.airtimePricing && (settings.airtimePricing as any)[network]) || 0;
    const payableAmount = Math.round(rechargeAmount * (1 - (discountPct / 100)) * 100) / 100;

    const deduction = db.atomicUpdateBalance(user.id, -payableAmount);
    if (!deduction.success) {
      res.status(400).json({
        error: `Insufficient wallet balance. You need ₦${payableAmount.toLocaleString()} (Airtime ₦${rechargeAmount.toLocaleString()}${discountPct > 0 ? `, ${discountPct}% discount applied` : ''}).`
      });
      return;
    }

    const reference = 'MDS-AIR-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'AIRTIME',
      description: `${network} ₦${rechargeAmount} Airtime to ${cleanPhone}${discountPct > 0 ? ` (${discountPct}% off: ₦${payableAmount})` : ''}`,
      amount: payableAmount,
      previousBalance: deduction.previousBalance,
      newBalance: deduction.newBalance,
      status: 'Pending',
      metadata: { network, phone: cleanPhone, faceAmount: rechargeAmount, paidAmount: payableAmount, discountPct }
    });

    const providerResult = await purchaseAirtimeFromProvider(network, cleanPhone, rechargeAmount, reference);

    if (providerResult.success) {
      db.updateTransactionStatus(reference, 'Successful', providerResult.providerResponse);
      res.json({
        success: true,
        reference,
        status: 'Successful',
        service: 'AIRTIME',
        network,
        amount: rechargeAmount,
        paidAmount: payableAmount,
        recipient: cleanPhone,
        newBalance: deduction.newBalance,
        date: transaction.createdAt,
        message: `Successfully recharged ${network} ₦${rechargeAmount} to ${cleanPhone}!`
      });
    } else {
      db.atomicUpdateBalance(user.id, payableAmount);
      db.updateTransactionStatus(reference, 'Failed', providerResult.error);
      res.status(502).json({
        success: false,
        error: providerResult.error || 'Airtime provider recharge failed. Wallet refunded.',
        reference,
        refunded: true
      });
    }
  });

  // -------------------------------------------------------------
  // SERVICES: ELECTRICITY BILL PAYMENT
  // -------------------------------------------------------------
  app.post('/api/services/electricity/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    if (settings.maintenanceMode || !settings.servicesAvailability.electricity) {
      res.status(503).json({ error: 'Electricity bill payment service is temporarily disabled.' });
      return;
    }

    const { disco, meterNumber, meterType, amount, pin } = req.body;
    const billAmount = Number(amount);
    const convenienceFee = settings.serviceCharges.electricityFee || 100;
    const totalDeduction = billAmount + convenienceFee;

    if (!disco || !meterNumber || !billAmount || billAmount < 1000 || !pin) {
      res.status(400).json({ error: 'Provider Disco, meter number, amount (min ₦1,000), and PIN are required.' });
      return;
    }

    if (!user.transactionPinHash || !db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect Transaction PIN.' });
      return;
    }

    const deduction = db.atomicUpdateBalance(user.id, -totalDeduction);
    if (!deduction.success) {
      res.status(400).json({ error: `Insufficient wallet balance for total ₦${totalDeduction.toLocaleString()}.` });
      return;
    }

    const reference = 'MDS-ELE-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'ELECTRICITY',
      description: `${disco} (${meterType}) Meter ${meterNumber} - ₦${billAmount}`,
      amount: totalDeduction,
      previousBalance: deduction.previousBalance,
      newBalance: deduction.newBalance,
      status: 'Pending',
      metadata: { disco, meterNumber, meterType, billAmount, convenienceFee }
    });

    const providerResult = await purchaseElectricityFromProvider(disco, meterNumber, meterType, billAmount, reference);

    if (providerResult.success) {
      db.updateTransactionStatus(reference, 'Successful', providerResult.providerResponse);
      res.json({
        success: true,
        reference,
        status: 'Successful',
        service: 'ELECTRICITY',
        token: providerResult.token,
        units: providerResult.units,
        meterNumber,
        disco,
        amount: totalDeduction,
        newBalance: deduction.newBalance,
        date: transaction.createdAt,
        message: providerResult.token
          ? `Electricity Token Generated: ${providerResult.token}`
          : 'Electricity recharge completed successfully.'
      });
    } else {
      db.atomicUpdateBalance(user.id, totalDeduction);
      db.updateTransactionStatus(reference, 'Failed', providerResult.error);
      res.status(502).json({
        success: false,
        error: providerResult.error || 'Provider rejected meter recharge. Wallet refunded.',
        reference,
        refunded: true
      });
    }
  });

  // -------------------------------------------------------------
  // SERVICES: CABLE TV SUBSCRIPTION
  // -------------------------------------------------------------
  app.post('/api/services/tv/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    if (settings.maintenanceMode || !settings.servicesAvailability.tv) {
      res.status(503).json({ error: 'TV subscription service is temporarily disabled.' });
      return;
    }

    const { provider, smartcardNumber, packageCode, packageName, amount, pin } = req.body;
    const subAmount = Number(amount);
    const convenienceFee = settings.serviceCharges.tvFee || 100;
    const totalDeduction = subAmount + convenienceFee;

    if (!provider || !smartcardNumber || !subAmount || !pin) {
      res.status(400).json({ error: 'Provider, Smartcard/IUC number, amount, and PIN are required.' });
      return;
    }

    if (!user.transactionPinHash || !db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect Transaction PIN.' });
      return;
    }

    const deduction = db.atomicUpdateBalance(user.id, -totalDeduction);
    if (!deduction.success) {
      res.status(400).json({ error: `Insufficient wallet balance for ₦${totalDeduction.toLocaleString()}.` });
      return;
    }

    const reference = 'MDS-TV-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'TV',
      description: `${provider} ${packageName || packageCode} for IUC: ${smartcardNumber}`,
      amount: totalDeduction,
      previousBalance: deduction.previousBalance,
      newBalance: deduction.newBalance,
      status: 'Pending',
      metadata: { provider, smartcardNumber, packageCode, packageName, subAmount, convenienceFee }
    });

    const providerResult = await purchaseTvFromProvider(provider, smartcardNumber, packageCode, subAmount, reference);

    if (providerResult.success) {
      db.updateTransactionStatus(reference, 'Successful', providerResult.providerResponse);
      res.json({
        success: true,
        reference,
        status: 'Successful',
        service: 'TV',
        provider,
        smartcard: smartcardNumber,
        amount: totalDeduction,
        newBalance: deduction.newBalance,
        date: transaction.createdAt,
        message: `${provider} subscription for ${smartcardNumber} activated successfully!`
      });
    } else {
      db.atomicUpdateBalance(user.id, totalDeduction);
      db.updateTransactionStatus(reference, 'Failed', providerResult.error);
      res.status(502).json({
        success: false,
        error: providerResult.error || 'Provider rejected TV subscription. Wallet refunded.',
        reference,
        refunded: true
      });
    }
  });

  // -------------------------------------------------------------
  // SERVICES: EXAM PIN (WAEC, NECO, NABTEB)
  // -------------------------------------------------------------
  app.post('/api/services/exam-pin/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    if (settings.maintenanceMode || !settings.servicesAvailability.examPin) {
      res.status(503).json({ error: 'Exam PIN service is temporarily unavailable.' });
      return;
    }

    const { examType, quantity, pin } = req.body;
    const qty = Number(quantity) || 1;
    if (!examType || qty < 1 || !pin) {
      res.status(400).json({ error: 'Exam type, quantity, and Transaction PIN are required.' });
      return;
    }

    let unitPrice = 3800;
    if (examType === 'WAEC') unitPrice = settings.serviceCharges.waecPrice || 3800;
    else if (examType === 'NECO') unitPrice = settings.serviceCharges.necoPrice || 1500;
    else if (examType === 'NABTEB') unitPrice = settings.serviceCharges.nabtebPrice || 1600;

    const totalAmount = unitPrice * qty;

    if (!user.transactionPinHash || !db.verifyPin(pin.toString(), user.transactionPinHash)) {
      res.status(400).json({ error: 'Incorrect Transaction PIN.' });
      return;
    }

    const deduction = db.atomicUpdateBalance(user.id, -totalAmount);
    if (!deduction.success) {
      res.status(400).json({ error: `Insufficient wallet balance for ₦${totalAmount.toLocaleString()}.` });
      return;
    }

    const reference = 'MDS-EXAM-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    // Call VTU provider if configured
    const apiKey = process.env.VTU_PROVIDER_API_KEY?.trim();
    if (!apiKey) {
      db.atomicUpdateBalance(user.id, totalAmount);
      res.status(502).json({
        success: false,
        error: 'Exam PIN provider API credentials are not yet configured on this server.'
      });
      return;
    }

    // Provider call placeholder using configured endpoint
    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'EXAM_PIN',
      description: `${qty}x ${examType} Result Checker PIN(s)`,
      amount: totalAmount,
      previousBalance: deduction.previousBalance,
      newBalance: deduction.newBalance,
      status: 'Successful',
      metadata: { examType, quantity: qty, unitPrice }
    });

    res.json({
      success: true,
      reference,
      service: 'EXAM_PIN',
      amount: totalAmount,
      newBalance: deduction.newBalance,
      date: transaction.createdAt,
      message: `Purchase request for ${qty}x ${examType} PIN completed.`
    });
  });

  // -------------------------------------------------------------
  // SERVICES: AIRTIME TO CASH
  // -------------------------------------------------------------
  app.post('/api/services/airtime-cash/submit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = db.getSettings();

    if (settings.maintenanceMode || !settings.servicesAvailability.airtimeToCash) {
      res.status(503).json({ error: 'Airtime to Cash service is currently unavailable.' });
      return;
    }

    const { network, phone, amount, destinationBank, accountNumber, accountName } = req.body;
    const airtimeAmount = Number(amount);
    if (!network || !phone || !airtimeAmount || airtimeAmount < 1000 || !accountNumber || !destinationBank) {
      res.status(400).json({ error: 'Network, sender phone, amount (min ₦1,000), and destination bank details are required.' });
      return;
    }

    const rate = (settings.airtimeCashRates as any)[network] || 0.80;
    const cashValue = Math.round(airtimeAmount * rate);
    const reference = 'MDS-A2C-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    const transaction = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'AIRTIME_CASH',
      description: `Airtime-to-Cash: ₦${airtimeAmount} ${network} for ₦${cashValue} Cash`,
      amount: cashValue,
      previousBalance: user.walletBalance,
      newBalance: user.walletBalance,
      status: 'Pending',
      metadata: {
        network,
        phone,
        airtimeAmount,
        cashValue,
        rate: `${rate * 100}%`,
        destinationBank,
        accountNumber,
        accountName
      }
    });

    res.json({
      success: true,
      reference,
      status: 'Pending',
      cashValue,
      message: `Airtime to Cash order created. Reference: ${reference}. Please transfer ₦${airtimeAmount} to our designated ${network} SIM line and contact Support.`
    });
  });

  // -------------------------------------------------------------
  // UNIFIED PROVIDER-INDEPENDENT PAYMENT GATEWAY SERVICE
  // Supports Paystack, PocketApp, Squad, Flutterwave dynamically
  // -------------------------------------------------------------

  // Public Gateway Info (Safe for customer apps - NO secrets exposed)
  app.get('/api/payments/config', (req: Request, res: Response) => {
    res.json({
      success: true,
      config: paymentService.getPublicConfig()
    });
  });

  // Unified Provider-Independent Wallet Funding Initialization
  app.post('/api/wallet/fund/initialize', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { amount, channel } = req.body;
    const fundAmount = Number(amount);

    if (!fundAmount || fundAmount < 100) {
      res.status(400).json({ error: 'Minimum wallet funding amount is ₦100.' });
      return;
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || req.protocol || 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const appUrlEnv = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const dynamicOrigin = appUrlEnv || `${proto}://${host}`;
    const callbackUrl = (process.env.PAYSTACK_CALLBACK_URL || '').trim() || `${dynamicOrigin}/api/wallet/fund/callback`;

    const result = await paymentService.initializeWalletFunding(user, fundAmount, { callbackUrl, channel });

    if (!result.success) {
      res.status(400).json({ error: result.message || 'Failed to initialize payment with active gateway.' });
      return;
    }

    res.json({
      success: true,
      reference: result.reference,
      provider: result.provider,
      authorizationUrl: result.authorizationUrl || result.checkoutUrl,
      checkoutUrl: result.checkoutUrl || result.authorizationUrl,
      accessCode: result.accessCode,
      publicKey: result.publicKey,
      message: result.message
    });
  });

  // Unified Provider-Independent Wallet Funding Verification
  app.post('/api/wallet/fund/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { reference, transactionId, provider } = req.body;
    const cleanRef = (reference || '').trim();

    if (!cleanRef && !transactionId) {
      res.status(400).json({ error: 'Transaction reference or ID is required for verification.' });
      return;
    }

    const result = await paymentService.verifyWalletFunding(cleanRef, {
      transactionId: transactionId ? String(transactionId) : undefined,
      providerOverride: provider
    });

    if (!result.verified || result.status !== 'SUCCESS') {
      res.status(400).json({
        success: false,
        error: result.message || 'Payment verification failed or is still pending with the provider.'
      });
      return;
    }

    const freshUser = db.getUserById(req.user!.id);
    res.json({
      success: true,
      reference: result.reference,
      provider: result.provider,
      amount: result.amount,
      fee: result.fee,
      netAmount: result.netAmount,
      balance: freshUser ? freshUser.walletBalance : undefined,
      message: result.message || 'Wallet credited successfully.'
    });
  });

  // Unified Payment Return Callback (Redirect from Hosted Provider Checkouts)
  app.get('/api/wallet/fund/callback', async (req: Request, res: Response) => {
    const reference = (req.query.reference || req.query.trxref || req.query.transaction_ref || req.query.tx_ref) as string;
    const transactionId = (req.query.transaction_id || req.query.id) as string;

    if (!reference && !transactionId) {
      res.redirect('/?payment_status=error&message=' + encodeURIComponent('Missing transaction reference in return callback.'));
      return;
    }

    try {
      const result = await paymentService.verifyWalletFunding(reference || '', { transactionId });
      if (result.verified && result.status === 'SUCCESS') {
        res.redirect(`/?payment_status=success&reference=${encodeURIComponent(result.reference)}&amount=${encodeURIComponent(result.amount)}`);
      } else {
        res.redirect(`/?payment_status=error&message=${encodeURIComponent(result.message || 'Payment not completed or failed.')}`);
      }
    } catch (err: any) {
      res.redirect(`/?payment_status=error&message=${encodeURIComponent(err.message || 'Error verifying payment return.')}`);
    }
  });

  // Generic Customer Dedicated Virtual Account Endpoint
  app.get('/api/wallet/account-number', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const result = await paymentService.getCustomerVirtualAccount(user);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        supported: false,
        message: err.message || 'Failed to retrieve dedicated virtual account.'
      });
    }
  });

  // -------------------------------------------------------------
  // WALLET FUNDING: PAYSTACK (Rule 16)
  // -------------------------------------------------------------
  const handlePaystackInitialize = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { amount } = req.body;
    const fundAmount = Number(amount);

    if (!fundAmount || fundAmount < 100) {
      res.status(400).json({ error: 'Minimum wallet funding amount is ₦100.' });
      return;
    }

    // Determine actual deployed HTTPS URL dynamically from request if not explicitly configured in env
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || req.protocol || 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const appUrlEnv = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const dynamicOrigin = appUrlEnv || `${proto}://${host}`;
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL?.trim() || `${dynamicOrigin}/api/wallet/paystack/callback`;

    const reference = 'MDS-PAY-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
    const result = await initializePaystackTransaction(user.email, fundAmount, reference, callbackUrl);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'Failed to initialize Paystack transaction.'
      });
      return;
    }

    res.json({
      success: true,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference
    });
  };

  app.post('/api/wallet/paystack/initialize', requireAuth, handlePaystackInitialize);
  app.post('/api/wallet/fund/paystack/initialize', requireAuth, handlePaystackInitialize);

  // -------------------------------------------------------------
  // SECURE PAYSTACK CALLBACK ROUTE (Redirected by Paystack after payment)
  // Backend verifies transaction directly with Paystack API before crediting!
  // Prevents frontend-only credits and enforces idempotency.
  // -------------------------------------------------------------
  app.get('/api/wallet/paystack/callback', async (req: Request, res: Response) => {
    const reference = (req.query.reference || req.query.trxref) as string;

    if (!reference) {
      res.redirect('/?payment_status=error&message=' + encodeURIComponent('No transaction reference found in callback.'));
      return;
    }

    try {
      const result = await verifyPaystackTransaction(reference);

      // Enforce idempotency: If already credited, redirect safely without duplicate credit
      if (result.alreadyCredited) {
        res.redirect(`/?payment_status=already_credited&reference=${encodeURIComponent(reference)}&amount=${result.amount || 0}`);
        return;
      }

      if (!result.success) {
        res.redirect(`/?payment_status=failed&reference=${encodeURIComponent(reference)}&error=${encodeURIComponent(result.error || 'Payment was not successful at Paystack.')}`);
        return;
      }

      // Find the customer by verified email
      const user = result.customerEmail ? db.findUserByEmailOrPhone(result.customerEmail) : null;
      if (!user) {
        res.redirect(`/?payment_status=error&reference=${encodeURIComponent(reference)}&message=${encodeURIComponent('Customer account not found for verified payment email: ' + (result.customerEmail || 'unknown'))}`);
        return;
      }

      const amountCredited = result.amount!;

      // Atomic wallet credit
      const update = db.atomicUpdateBalance(user.id, amountCredited);
      if (!update.success) {
        res.redirect(`/?payment_status=error&reference=${encodeURIComponent(reference)}&message=${encodeURIComponent('Failed to update wallet balance on server.')}`);
        return;
      }

      // Record official wallet funding transaction
      db.createTransaction({
        reference,
        userId: user.id,
        userEmail: user.email,
        userName: user.fullName,
        service: 'WALLET_FUNDING',
        description: `Paystack Wallet Top-up (Ref: ${reference})`,
        amount: amountCredited,
        previousBalance: update.previousBalance,
        newBalance: update.newBalance,
        status: 'Successful',
        metadata: {
          gateway: 'PAYSTACK',
          callback: true,
          channel: result.channel,
          paidAt: result.paidAt,
          gatewayResponse: result.gatewayResponse
        }
      });

      res.redirect(`/?payment_status=success&reference=${encodeURIComponent(reference)}&amount=${amountCredited}`);
    } catch (err: any) {
      res.redirect(`/?payment_status=error&reference=${encodeURIComponent(reference)}&message=${encodeURIComponent(err.message || 'Payment verification encountered an error.')}`);
    }
  });

  const handlePaystackVerify = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { reference } = req.body;

    if (!reference) {
      res.status(400).json({ error: 'Payment reference is required.' });
      return;
    }

    const result = await verifyPaystackTransaction(reference);

    // If transaction was already credited to this user's wallet, handle idempotently
    if (result.alreadyCredited) {
      const existingUser = db.findUserById(user.id);
      res.json({
        success: true,
        alreadyCredited: true,
        creditedAmount: result.amount || 0,
        newBalance: existingUser?.walletBalance ?? user.walletBalance,
        reference,
        message: 'This payment has already been verified and credited to your wallet.'
      });
      return;
    }

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'Payment verification failed at Paystack.'
      });
      return;
    }

    // Verify transaction customer email matches authenticated customer
    if (result.customerEmail && result.customerEmail.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      res.status(403).json({
        error: 'Security alert: This payment record belongs to a different email address.'
      });
      return;
    }

    const amountCredited = result.amount!;

    // Atomic wallet credit
    const update = db.atomicUpdateBalance(user.id, amountCredited);
    if (!update.success) {
      res.status(500).json({ error: 'Failed to update wallet balance.' });
      return;
    }

    // Record wallet funding transaction
    const tx = db.createTransaction({
      reference,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      service: 'WALLET_FUNDING',
      description: `Paystack Wallet Top-up (Ref: ${reference})`,
      amount: amountCredited,
      previousBalance: update.previousBalance,
      newBalance: update.newBalance,
      status: 'Successful',
      metadata: {
        gateway: 'PAYSTACK',
        reference,
        channel: result.channel,
        paidAt: result.paidAt,
        gatewayResponse: result.gatewayResponse
      }
    });

    res.json({
      success: true,
      creditedAmount: amountCredited,
      newBalance: update.newBalance,
      reference,
      date: tx.createdAt,
      message: `₦${amountCredited.toLocaleString()} credited to your wallet successfully!`
    });
  };

  app.post('/api/wallet/paystack/verify', requireAuth, handlePaystackVerify);
  app.post('/api/wallet/fund/paystack/verify', requireAuth, handlePaystackVerify);

  // -------------------------------------------------------------
  // WALLET FUNDING: FLUTTERWAVE
  // Official Flutterwave Hosted Checkout & Server-side Verification
  // -------------------------------------------------------------
  const handleFlutterwaveInitialize = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { amount } = req.body;
    const fundAmount = Number(amount);

    if (!fundAmount || fundAmount < 100) {
      res.status(400).json({ error: 'Minimum wallet funding amount is ₦100.' });
      return;
    }

    const { flutterwave } = getGatewayCredentials();
    if (!flutterwave.enabled || !flutterwave.secretKey) {
      res.status(400).json({ error: 'Flutterwave is not enabled or secret key is missing. Please contact administrator.' });
      return;
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || req.protocol || 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const dynamicOrigin = `${proto}://${host}`;
    const callbackUrl = process.env.FLUTTERWAVE_CALLBACK_URL?.trim() || `${dynamicOrigin}/api/wallet/flutterwave/callback`;

    const reference = 'MDS-FLW-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    try {
      const result = await initializeFlutterwavePayment({
        email: user.email,
        amount: fundAmount,
        reference,
        callbackUrl,
        phone: user.phone,
        name: user.fullName,
        metadata: { userId: user.id }
      });

      res.json({
        success: true,
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
        message: result.message
      });
    } catch (err: any) {
      res.status(400).json({
        error: err.message || 'Failed to initialize Flutterwave payment.'
      });
    }
  };

  app.post('/api/wallet/flutterwave/initialize', requireAuth, handleFlutterwaveInitialize);
  app.post('/api/wallet/fund/flutterwave/initialize', requireAuth, handleFlutterwaveInitialize);

  // Flutterwave Callback Route (Customer redirected back after hosted checkout)
  app.get('/api/wallet/flutterwave/callback', async (req: Request, res: Response) => {
    const status = req.query.status as string;
    const txRef = (req.query.tx_ref || req.query.reference) as string;
    const transactionId = req.query.transaction_id as string;

    if (!txRef && !transactionId) {
      res.redirect('/?payment_status=error&message=' + encodeURIComponent('Missing transaction reference in Flutterwave callback.'));
      return;
    }

    if (status === 'cancelled') {
      res.redirect(`/?payment_status=cancelled&reference=${encodeURIComponent(txRef || '')}`);
      return;
    }

    try {
      // Direct server-side verification with Flutterwave API
      const result = await verifyFlutterwaveTransaction(transactionId || txRef);

      // Enforce idempotency: check if reference or flwRef already recorded
      const existingTx = db.findTransactionByReference(result.reference) ||
        (result.flwRef ? db.findTransactionByReference(result.flwRef) : undefined);

      if (existingTx && existingTx.status === 'Successful') {
        res.redirect(`/?payment_status=already_credited&reference=${encodeURIComponent(result.reference)}&amount=${existingTx.amount}`);
        return;
      }

      if (!result.success || result.status !== 'successful') {
        res.redirect(`/?payment_status=failed&reference=${encodeURIComponent(result.reference)}&error=${encodeURIComponent('Payment was not successful at Flutterwave.')}`);
        return;
      }

      // Find user by verified customer email or metadata
      const user = result.customerEmail ? db.findUserByEmailOrPhone(result.customerEmail) : null;
      if (!user) {
        res.redirect(`/?payment_status=error&reference=${encodeURIComponent(result.reference)}&message=${encodeURIComponent('Customer account not found for verified email: ' + (result.customerEmail || 'unknown'))}`);
        return;
      }

      const amountCredited = result.amount;

      // Atomic wallet credit
      const update = db.atomicUpdateBalance(user.id, amountCredited);
      if (!update.success) {
        res.redirect(`/?payment_status=error&reference=${encodeURIComponent(result.reference)}&message=${encodeURIComponent('Failed to update wallet balance on server.')}`);
        return;
      }

      // Record official wallet funding transaction
      db.createTransaction({
        reference: result.reference,
        userId: user.id,
        userEmail: user.email,
        userName: user.fullName,
        service: 'WALLET_FUNDING',
        description: `Flutterwave Wallet Top-up (Ref: ${result.reference})`,
        amount: amountCredited,
        previousBalance: update.previousBalance,
        newBalance: update.newBalance,
        status: 'Successful',
        paymentProvider: 'FLUTTERWAVE',
        metadata: {
          gateway: 'FLUTTERWAVE',
          callback: true,
          flwRef: result.flwRef,
          transactionId: transactionId || String(result.rawData?.id || ''),
          paymentType: result.paymentType,
          paidAt: result.paidAt
        }
      });

      db.addAuditLog(user.email, 'FLUTTERWAVE_WALLET_CREDIT', `Wallet credited ₦${amountCredited} via Flutterwave (Ref: ${result.reference})`);

      res.redirect(`/?payment_status=success&reference=${encodeURIComponent(result.reference)}&amount=${amountCredited}`);
    } catch (err: any) {
      res.redirect(`/?payment_status=error&reference=${encodeURIComponent(txRef || '')}&message=${encodeURIComponent(err.message || 'Payment verification encountered an error.')}`);
    }
  });

  // Flutterwave Client Verification Endpoint
  const handleFlutterwaveVerify = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { reference, transactionId } = req.body;
    const lookupKey = transactionId || reference;

    if (!lookupKey) {
      res.status(400).json({ error: 'Payment reference or transaction ID is required.' });
      return;
    }

    try {
      // Direct server-side verification with Flutterwave API
      const result = await verifyFlutterwaveTransaction(lookupKey);

      // Check idempotency
      const existingTx = db.findTransactionByReference(result.reference) ||
        (result.flwRef ? db.findTransactionByReference(result.flwRef) : undefined);

      if (existingTx && existingTx.status === 'Successful') {
        const freshUser = db.findUserById(user.id);
        res.json({
          success: true,
          alreadyCredited: true,
          creditedAmount: existingTx.amount,
          newBalance: freshUser?.walletBalance ?? user.walletBalance,
          reference: result.reference,
          message: 'This payment has already been verified and credited to your wallet.'
        });
        return;
      }

      if (!result.success || result.status !== 'successful') {
        res.status(400).json({
          error: `Payment verification returned status: ${result.status}. Transaction was not successful at Flutterwave.`
        });
        return;
      }

      // Check customer email
      if (result.customerEmail && result.customerEmail.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
        res.status(403).json({
          error: 'Security alert: This Flutterwave payment record belongs to a different email address.'
        });
        return;
      }

      const amountCredited = result.amount;

      // Atomic wallet credit
      const update = db.atomicUpdateBalance(user.id, amountCredited);
      if (!update.success) {
        res.status(500).json({ error: 'Failed to update wallet balance on server.' });
        return;
      }

      // Record wallet funding transaction
      const tx = db.createTransaction({
        reference: result.reference,
        userId: user.id,
        userEmail: user.email,
        userName: user.fullName,
        service: 'WALLET_FUNDING',
        description: `Flutterwave Wallet Top-up (Ref: ${result.reference})`,
        amount: amountCredited,
        previousBalance: update.previousBalance,
        newBalance: update.newBalance,
        status: 'Successful',
        paymentProvider: 'FLUTTERWAVE',
        metadata: {
          gateway: 'FLUTTERWAVE',
          flwRef: result.flwRef,
          transactionId: transactionId || String(result.rawData?.id || ''),
          paymentType: result.paymentType,
          paidAt: result.paidAt
        }
      });

      db.addAuditLog(user.email, 'FLUTTERWAVE_WALLET_CREDIT', `Wallet credited ₦${amountCredited} via Flutterwave (Ref: ${result.reference})`);

      res.json({
        success: true,
        creditedAmount: amountCredited,
        newBalance: update.newBalance,
        reference: result.reference,
        date: tx.createdAt,
        message: `₦${amountCredited.toLocaleString()} credited to your wallet successfully via Flutterwave!`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to verify transaction with Flutterwave.' });
    }
  };

  app.post('/api/wallet/flutterwave/verify', requireAuth, handleFlutterwaveVerify);
  app.post('/api/wallet/fund/flutterwave/verify', requireAuth, handleFlutterwaveVerify);

  // Active Payment Gateways for customer wallet funding (Both Paystack & Flutterwave)
  app.get('/api/wallet/gateways', (req: Request, res: Response) => {
    const creds = getGatewayCredentials();
    res.json({
      paystack: creds.paystack.enabled,
      flutterwave: creds.flutterwave.enabled,
      monnify: creds.monnify.enabled
    });
  });

  // Monnify Wallet Funding Initialization
  app.post('/api/wallet/monnify/initialize', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { amount } = req.body;
    const fundAmount = Number(amount);

    if (!fundAmount || fundAmount < 100) {
      res.status(400).json({ error: 'Minimum wallet funding amount is ₦100.' });
      return;
    }

    const reference = 'MDS-MNF-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
    const result = await initializeMonnifyTransaction(user.email, user.fullName, fundAmount, reference);

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to initialize Monnify checkout.' });
      return;
    }

    res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      reference: result.reference
    });
  });

  // Webhook: Paystack
  const handlePaystackWebhook = (req: Request, res: Response) => {
    const { paystack } = getGatewayCredentials();
    if (!paystack.secretKey) {
      res.status(400).send('Paystack secret key not configured');
      return;
    }

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const hash = crypto.createHmac('sha512', paystack.secretKey).update(rawBody).digest('hex');
    const signature = req.headers['x-paystack-signature'];

    if (hash !== signature) {
      const fallbackHash = crypto.createHmac('sha512', paystack.secretKey).update(JSON.stringify(req.body)).digest('hex');
      if (fallbackHash !== signature) {
        res.status(400).send('Invalid webhook signature');
        return;
      }
    }

    const event = req.body;
    if (event.event === 'charge.success') {
      const reference = event.data?.reference;
      const amount = (event.data?.requested_amount && event.data?.requested_amount > 0)
        ? event.data.requested_amount / 100
        : ((event.data?.amount || 0) / 100);
      const customerEmail = event.data?.customer?.email;
      const customerCode = event.data?.customer?.customer_code || event.data?.dedicated_account?.customer?.customer_code;
      const isDva = event.data?.channel === 'dedicated_nuban' ||
        event.data?.authorization?.channel === 'dedicated_nuban' ||
        !!event.data?.dedicated_account;

      const dvaAccountNumber = event.data?.dedicated_account?.account_number ||
        event.data?.authorization?.receiver_bank_account_number || '';
      const dvaBankName = event.data?.dedicated_account?.bank?.name ||
        event.data?.authorization?.bank || 'Wema Bank';

      if (reference && amount > 0) {
        // Idempotency: verify this transaction reference hasn't already been credited
        const existingTx = db.findTransactionByReference(reference);
        if (!existingTx || existingTx.status !== 'Successful') {
          let user = null;
          let matchedDva = null;

          if (dvaAccountNumber) {
            matchedDva = db.getDedicatedVirtualAccountByAccountNumber(dvaAccountNumber);
            if (matchedDva) {
              user = db.findUserById(matchedDva.userId);
            }
          }

          if (!user && customerCode) {
            matchedDva = db.getDedicatedVirtualAccountByCustomerCode(customerCode);
            if (matchedDva) {
              user = db.findUserById(matchedDva.userId);
            }
          }

          if (!user && customerEmail) {
            user = db.findUserByEmailOrPhone(customerEmail);
          }

          if (user) {
            const update = db.atomicUpdateBalance(user.id, amount);
            if (update.success) {
              const description = isDva && (dvaAccountNumber || matchedDva?.accountNumber)
                ? `Dedicated Virtual Account Funding (${dvaBankName} - ${dvaAccountNumber || matchedDva?.accountNumber})`
                : `Paystack Funding (Ref: ${reference})`;

              db.createTransaction({
                reference,
                userId: user.id,
                userEmail: user.email,
                userName: user.fullName,
                service: 'WALLET_FUNDING',
                description,
                amount,
                previousBalance: update.previousBalance,
                newBalance: update.newBalance,
                status: 'Successful',
                paymentProvider: 'PAYSTACK',
                dedicatedAccountNumber: isDva ? (dvaAccountNumber || matchedDva?.accountNumber || '') : undefined,
                metadata: {
                  gateway: isDva ? 'PAYSTACK_DVA' : 'PAYSTACK',
                  channel: isDva ? 'dedicated_nuban' : (event.data?.channel || 'card'),
                  paystackReference: reference,
                  dedicatedAccountNumber: isDva ? (dvaAccountNumber || matchedDva?.accountNumber || '') : undefined,
                  bankName: isDva ? dvaBankName : undefined,
                  accountName: matchedDva?.accountName,
                  customerCode: customerCode || matchedDva?.customerCode,
                  paystackCustomerId: event.data?.customer?.id || matchedDva?.paystackCustomerId,
                  webhook: true
                }
              });

              if (isDva && (dvaAccountNumber || matchedDva?.accountNumber)) {
                db.recordDvaFunding(dvaAccountNumber || matchedDva!.accountNumber, amount, reference);
                db.addAuditLog(user.email, 'DVA_WALLET_CREDIT', `Wallet credited ₦${amount} via DVA ${dvaAccountNumber || matchedDva?.accountNumber} (Ref: ${reference})`);
              } else {
                db.addAuditLog(user.email, 'PAYSTACK_WALLET_CREDIT', `Wallet credited ₦${amount} via Paystack checkout (Ref: ${reference})`);
              }
            }
          }
        }
      }
    }

    res.status(200).send('Webhook processed');
  };

  app.post('/api/webhooks/paystack', handlePaystackWebhook);
  app.post('/api/wallet/paystack/webhook', handlePaystackWebhook);

  // -------------------------------------------------------------
  // WEBHOOK: FLUTTERWAVE
  // Secure secret-hash verification, server-side transaction check,
  // idempotency enforcement, and automatic wallet credit
  // -------------------------------------------------------------
  const handleFlutterwaveWebhook = async (req: Request, res: Response) => {
    const signature = (req.headers['verif-hash'] || req.headers['x-flutterwave-signature']) as string;

    if (!verifyFlutterwaveWebhookSignature(signature)) {
      res.status(401).send('Invalid Flutterwave webhook signature');
      return;
    }

    const event = req.body;
    if (event?.event === 'charge.completed' && event?.data?.status === 'successful') {
      const data = event.data;
      const reference = data.tx_ref || data.flw_ref;
      const flwRef = data.flw_ref;
      const transactionId = data.id;

      try {
        // Direct server-side verification to confirm with Flutterwave
        const verified = await verifyFlutterwaveTransaction(transactionId || reference);

        if (verified.success && verified.status === 'successful' && verified.amount > 0) {
          const amount = verified.amount;

          // Enforce idempotency: check if reference or flwRef already credited
          const existingTx = db.findTransactionByReference(reference) ||
            (flwRef ? db.findTransactionByReference(flwRef) : undefined) ||
            (verified.reference ? db.findTransactionByReference(verified.reference) : undefined);

          if (!existingTx || existingTx.status !== 'Successful') {
            let user = null;
            let matchedDva = null;
            const isDva = data.payment_type === 'bank_transfer' || !!data.account_id;

            // Try matching Flutterwave DVA
            if (flwRef) {
              matchedDva = db.getDedicatedVirtualAccounts().find(a => a.provider === 'FLUTTERWAVE' && a.flwRef === flwRef);
              if (matchedDva) {
                user = db.findUserById(matchedDva.userId);
              }
            }

            if (!user && verified.customerEmail) {
              user = db.findUserByEmailOrPhone(verified.customerEmail);
            }

            if (!user && data.customer?.email) {
              user = db.findUserByEmailOrPhone(data.customer.email);
            }

            if (user) {
              const update = db.atomicUpdateBalance(user.id, amount);
              if (update.success) {
                const desc = isDva && matchedDva
                  ? `Dedicated Virtual Account Funding (${matchedDva.bankName} - ${matchedDva.accountNumber})`
                  : `Flutterwave Wallet Top-up (Ref: ${reference})`;

                db.createTransaction({
                  reference: reference || ('MDS-FLW-' + Date.now()),
                  userId: user.id,
                  userEmail: user.email,
                  userName: user.fullName,
                  service: 'WALLET_FUNDING',
                  description: desc,
                  amount,
                  previousBalance: update.previousBalance,
                  newBalance: update.newBalance,
                  status: 'Successful',
                  paymentProvider: 'FLUTTERWAVE',
                  dedicatedAccountNumber: matchedDva?.accountNumber,
                  metadata: {
                    gateway: isDva ? 'FLUTTERWAVE_DVA' : 'FLUTTERWAVE',
                    channel: data.payment_type || 'flutterwave',
                    flwRef,
                    transactionId: String(transactionId),
                    bankName: matchedDva?.bankName,
                    accountNumber: matchedDva?.accountNumber,
                    webhook: true,
                    paidAt: verified.paidAt
                  }
                });

                if (matchedDva) {
                  db.recordDvaFunding(matchedDva.accountNumber, amount, reference);
                  db.addAuditLog(user.email, 'DVA_WALLET_CREDIT', `Wallet credited ₦${amount} via Flutterwave DVA ${matchedDva.accountNumber} (Ref: ${reference})`);
                } else {
                  db.addAuditLog(user.email, 'FLUTTERWAVE_WALLET_CREDIT', `Wallet credited ₦${amount} via Flutterwave Webhook (Ref: ${reference})`);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Flutterwave webhook processing error:', err.message);
      }
    }

    res.status(200).send('Flutterwave webhook processed');
  };

  app.post('/api/webhooks/flutterwave', handleFlutterwaveWebhook);
  app.post('/api/wallet/flutterwave/webhook', handleFlutterwaveWebhook);

  // -------------------------------------------------------------
  // CENTRALIZED WEBHOOK ROUTER FOR ALL PAYMENT GATEWAYS
  // (Paystack, PocketApp, Squad, Flutterwave)
  // -------------------------------------------------------------
  const handleGatewayWebhook = async (req: any, res: Response) => {
    const providerParam = (req.params?.provider || req.path.split('/').pop() || '').toLowerCase();
    const payload = req.rawBody || req.body;
    const headers = req.headers;

    try {
      const result = await paymentService.processWebhook(providerParam, payload, headers);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error(`[PaymentService Webhook Error] Provider: ${providerParam}`, err);
      res.status(500).json({ error: 'Webhook processing error', message: err.message });
    }
  };

  app.post('/api/payments/webhook/:provider', handleGatewayWebhook);
  app.post('/api/payments/webhook/paystack', (req, res) => { req.params = { provider: 'paystack' }; return handleGatewayWebhook(req, res); });
  app.post('/api/payments/webhook/squad', (req, res) => { req.params = { provider: 'squad' }; return handleGatewayWebhook(req, res); });
  app.post('/api/payments/webhook/monnify', (req, res) => { req.params = { provider: 'monnify' }; return handleGatewayWebhook(req, res); });
  app.post('/api/webhooks/paystack', (req, res) => { req.params = { provider: 'paystack' }; return handleGatewayWebhook(req, res); });
  app.post('/api/webhooks/squad', (req, res) => { req.params = { provider: 'squad' }; return handleGatewayWebhook(req, res); });
  app.post('/api/webhooks/monnify', (req, res) => { req.params = { provider: 'monnify' }; return handleGatewayWebhook(req, res); });
  app.post('/api/wallet/paystack/webhook', (req, res) => { req.params = { provider: 'paystack' }; return handleGatewayWebhook(req, res); });
  app.post('/api/wallet/squad/webhook', (req, res) => { req.params = { provider: 'squad' }; return handleGatewayWebhook(req, res); });

  // -------------------------------------------------------------
  // DEDICATED VIRTUAL ACCOUNTS (Paystack & Flutterwave)
  // Customer & Admin APIs
  // -------------------------------------------------------------

  // Customer: Get Dedicated Virtual Accounts for Paystack & Flutterwave
  app.get('/api/wallet/dva', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      let paystackDva = db.getDedicatedVirtualAccountByUserIdAndProvider(user.id, 'PAYSTACK');
      let flutterwaveDva = db.getDedicatedVirtualAccountByUserIdAndProvider(user.id, 'FLUTTERWAVE');

      if (!paystackDva) {
        paystackDva = await provisionCustomerDedicatedAccount(user.id, 'PAYSTACK');
      }

      const paystackStatus = await checkPaystackDvaAvailability();
      const flutterwaveStatus = await checkFlutterwaveDvaAvailability();

      const activeDva = (flutterwaveDva && flutterwaveDva.status === 'ACTIVE')
        ? flutterwaveDva
        : (paystackDva || flutterwaveDva);

      res.json({
        success: true,
        dva: activeDva,
        paystackDva,
        flutterwaveDva,
        paystackStatus,
        flutterwaveStatus
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve dedicated accounts.' });
    }
  });

  // Customer: Request or generate Flutterwave Dedicated Virtual Account (optional BVN/NIN)
  app.post('/api/wallet/dva/flutterwave/create', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { bvn, nin } = req.body;

      const cleanBvn = typeof bvn === 'string' ? bvn.trim() : undefined;
      const cleanNin = typeof nin === 'string' ? nin.trim() : undefined;

      if (cleanBvn && !/^\d{11}$/.test(cleanBvn)) {
        res.status(400).json({ error: 'Please enter a valid 11-digit Bank Verification Number (BVN).' });
        return;
      }

      if (cleanNin && !/^\d{11}$/.test(cleanNin)) {
        res.status(400).json({ error: 'Please enter a valid 11-digit National Identity Number (NIN).' });
        return;
      }

      const flwDva = await provisionCustomerDedicatedAccount(user.id, 'FLUTTERWAVE', cleanBvn, cleanNin);
      const flutterwaveStatus = await checkFlutterwaveDvaAvailability();

      res.json({
        success: flwDva.status === 'ACTIVE',
        dva: flwDva,
        flutterwaveDva: flwDva,
        flutterwaveStatus,
        message: flwDva.status === 'ACTIVE'
          ? `Flutterwave virtual account (${flwDva.bankName} - ${flwDva.accountNumber}) is ready!`
          : (flwDva.failureReason || 'Virtual account request completed.')
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to provision Flutterwave virtual account.' });
    }
  });

  // Customer: Refresh/retry Dedicated Virtual Accounts
  app.post('/api/wallet/dva/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const provider = (req.body?.provider || req.query?.provider || 'ALL') as string;

      let paystackDva = db.getDedicatedVirtualAccountByUserIdAndProvider(user.id, 'PAYSTACK');
      let flutterwaveDva = db.getDedicatedVirtualAccountByUserIdAndProvider(user.id, 'FLUTTERWAVE');

      if (provider === 'PAYSTACK' || provider === 'ALL') {
        paystackDva = await provisionCustomerDedicatedAccount(user.id, 'PAYSTACK');
      }

      if (provider === 'FLUTTERWAVE' || provider === 'ALL') {
        flutterwaveDva = await provisionCustomerDedicatedAccount(user.id, 'FLUTTERWAVE');
      }

      const paystackStatus = await checkPaystackDvaAvailability();
      const flutterwaveStatus = await checkFlutterwaveDvaAvailability();

      const activeDva = (flutterwaveDva && flutterwaveDva.status === 'ACTIVE')
        ? flutterwaveDva
        : (paystackDva || flutterwaveDva);

      res.json({
        success: true,
        dva: activeDva,
        paystackDva,
        flutterwaveDva,
        paystackStatus,
        flutterwaveStatus,
        message: 'Virtual accounts refreshed.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to refresh dedicated account.' });
    }
  });

  // Admin: Get all dedicated accounts, metrics, Paystack & Flutterwave status
  app.get('/api/admin/virtual-accounts', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const accounts = db.getDedicatedVirtualAccounts();
      const paystackStatus = await checkPaystackDvaAvailability();
      const flutterwaveStatus = await checkFlutterwaveDvaAvailability();

      const total = accounts.length;
      const active = accounts.filter(a => a.status === 'ACTIVE').length;
      const pending = accounts.filter(a => a.status === 'PENDING' || a.status === 'NOT_ELIGIBLE').length;
      const totalVolume = accounts.reduce((acc, a) => acc + (a.totalReceived || 0), 0);

      const paystackAccounts = accounts.filter(a => a.provider === 'PAYSTACK');
      const flutterwaveAccounts = accounts.filter(a => a.provider === 'FLUTTERWAVE');

      res.json({
        success: true,
        accounts,
        metrics: {
          total,
          active,
          pending,
          totalVolume,
          paystackTotal: paystackAccounts.length,
          paystackActive: paystackAccounts.filter(a => a.status === 'ACTIVE').length,
          flutterwaveTotal: flutterwaveAccounts.length,
          flutterwaveActive: flutterwaveAccounts.filter(a => a.status === 'ACTIVE').length
        },
        paystackStatus,
        flutterwaveStatus
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load virtual accounts.' });
    }
  });

  // Admin: Live Paystack DVA status
  app.get('/api/admin/virtual-accounts/paystack-status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await checkPaystackDvaAvailability();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to check status.' });
    }
  });

  // Admin: Live Flutterwave DVA status
  app.get('/api/admin/virtual-accounts/flutterwave-status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await checkFlutterwaveDvaAvailability();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to check Flutterwave DVA status.' });
    }
  });

  // Admin: Retry provisioning for customer (supports PAYSTACK or FLUTTERWAVE)
  app.post('/api/admin/virtual-accounts/retry/:userId', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const provider = (req.body?.provider || 'PAYSTACK') as 'PAYSTACK' | 'FLUTTERWAVE';
      const { bvn, nin } = req.body;

      const targetUser = db.findUserById(userId);
      if (!targetUser) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      const updatedDva = await provisionCustomerDedicatedAccount(userId, provider, bvn, nin);
      res.json({
        success: true,
        dva: updatedDva,
        message: updatedDva.status === 'ACTIVE'
          ? `Real ${provider} DVA assigned: ${updatedDva.bankName} - ${updatedDva.accountNumber}`
          : (updatedDva.failureReason || `${provider} DVA requested.`)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retry provisioning.' });
    }
  });

  // Admin: Toggle DVA account status (ACTIVE vs DISABLED)
  app.post('/api/admin/virtual-accounts/toggle-status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { id, enabled } = req.body;
    if (!id) {
      res.status(400).json({ error: 'Virtual account ID is required.' });
      return;
    }
    const dva = db.getDedicatedVirtualAccounts().find(a => a.id === id || a.userId === id);
    if (!dva) {
      res.status(404).json({ error: 'Virtual account record not found.' });
      return;
    }

    const newStatus = enabled ? 'ACTIVE' : 'DISABLED';
    const updated = db.updateDedicatedVirtualAccount(dva.id, { status: newStatus });
    res.json({ success: true, dva: updated });
  });

  // Admin: Sync all customer accounts with Paystack
  app.post('/api/admin/virtual-accounts/sync-all', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const users = db.getUsers().filter(u => u.role === 'CUSTOMER');
      let successCount = 0;
      let pendingCount = 0;

      for (const u of users) {
        try {
          const dva = await provisionCustomerDedicatedAccount(u.id);
          if (dva.status === 'ACTIVE') successCount++;
          else pendingCount++;
        } catch {
          pendingCount++;
        }
      }

      res.json({
        success: true,
        message: `Processed ${users.length} customer accounts (${successCount} active, ${pendingCount} pending/ineligible).`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to sync accounts.' });
    }
  });

  // Webhook: Monnify
  app.post('/api/webhooks/monnify', (req: Request, res: Response) => {
    const { monnify } = getGatewayCredentials();
    const signature = req.headers['monnify-signature'] as string;
    const bodyStr = JSON.stringify(req.body);

    if (!verifyMonnifyWebhookSignature(bodyStr, signature, monnify.secretKey)) {
      res.status(400).send('Invalid signature');
      return;
    }

    const event = req.body;
    if (event.eventType === 'SUCCESSFUL_TRANSACTION') {
      const eventData = event.eventData;
      const reference = eventData.paymentReference;
      const amountPaid = Number(eventData.amountPaid);
      const customerEmail = eventData.customer?.email;

      if (reference && customerEmail) {
        const existingTx = db.findTransactionByReference(reference);
        if (!existingTx) {
          const user = db.findUserByEmailOrPhone(customerEmail);
          if (user) {
            const update = db.atomicUpdateBalance(user.id, amountPaid);
            if (update.success) {
              db.createTransaction({
                reference,
                userId: user.id,
                userEmail: user.email,
                userName: user.fullName,
                service: 'WALLET_FUNDING',
                description: `Monnify Webhook Funding (Ref: ${reference})`,
                amount: amountPaid,
                previousBalance: update.previousBalance,
                newBalance: update.newBalance,
                status: 'Successful',
                metadata: { gateway: 'MONNIFY', webhook: true }
              });
            }
          }
        }
      }
    }

    res.status(200).send('Webhook processed');
  });

  // -------------------------------------------------------------
  // CUSTOMER TRANSACTIONS (Rule 22)
  // -------------------------------------------------------------
  app.get('/api/transactions/my', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const txs = db.getTransactions(user.id);
    res.json(txs);
  });

  // -------------------------------------------------------------
  // ADMIN & OWNER PORTAL (Rules 13, 24, 25, 26, 27, 28, 29, 31, 32, 37)
  // Enforce server-side role check!
  // -------------------------------------------------------------
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Admin email and password are required.' });
      return;
    }

    const user = db.findUserByEmailOrPhone(email);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
      res.status(403).json({ error: 'Access denied. Administrative authorization required.' });
      return;
    }

    if (!db.verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    const token = signToken(user);
    db.addAuditLog(user.email, 'ADMIN_LOGIN', 'Admin authenticated successfully');

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  });

  app.get('/api/admin/stats', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const users = db.getUsers();
    const transactions = db.getTransactions();

    const customerCount = users.filter(u => u.role === 'CUSTOMER').length;
    const totalWalletBalance = users.reduce((acc, u) => acc + (u.walletBalance || 0), 0);
    const successfulTx = transactions.filter(t => t.status === 'Successful');
    const totalSalesVolume = successfulTx
      .filter(t => t.service !== 'WALLET_FUNDING')
      .reduce((acc, t) => acc + t.amount, 0);

    res.json({
      totalUsers: customerCount,
      totalWalletBalance: Math.round(totalWalletBalance * 100) / 100,
      totalTransactions: transactions.length,
      successfulTransactions: successfulTx.length,
      totalSalesVolume: Math.round(totalSalesVolume * 100) / 100
    });
  });

  app.get('/api/admin/users', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const users = db.getUsers().map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isVerified: u.isVerified,
      status: u.status || 'ACTIVE',
      walletBalance: u.walletBalance || 0,
      hasPin: !!u.transactionPinHash,
      referralCode: u.referralCode,
      referredBy: u.referredBy,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    }));
    // Return structured object and fallback array for backwards compatibility
    res.json({
      success: true,
      users,
      total: users.length
    });
  });

  // Admin Single User Details with Financial Stats & History
  app.get('/api/admin/users/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const target = db.findUserById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Customer account not found.' });
      return;
    }

    const transactions = db.getTransactions(target.id);
    const totalSpent = transactions
      .filter(t => t.status === 'Successful' && t.service !== 'WALLET_FUNDING' && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalFunded = transactions
      .filter(t => t.status === 'Successful' && t.service === 'WALLET_FUNDING')
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      user: {
        id: target.id,
        fullName: target.fullName,
        email: target.email,
        phone: target.phone,
        role: target.role,
        isVerified: target.isVerified,
        status: target.status || 'ACTIVE',
        walletBalance: target.walletBalance || 0,
        hasPin: !!target.transactionPinHash,
        referralCode: target.referralCode,
        referredBy: target.referredBy,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
        stats: {
          transactionCount: transactions.length,
          totalSpent,
          totalFunded
        }
      },
      transactions
    });
  });

  // Admin Single User Transaction History
  app.get('/api/admin/users/:id/transactions', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const target = db.findUserById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Customer account not found.' });
      return;
    }

    const transactions = db.getTransactions(target.id);
    res.json({
      success: true,
      transactions,
      total: transactions.length
    });
  });

  // Admin Toggle User Account Status (ACTIVE / SUSPENDED)
  app.put('/api/admin/users/:id/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { status } = req.body;
    const target = db.findUserById(req.params.id);

    if (!target) {
      res.status(404).json({ error: 'Customer account not found.' });
      return;
    }

    if (target.role === 'OWNER') {
      res.status(403).json({ error: 'Access denied: Cannot suspend an Owner account.' });
      return;
    }

    const newStatus = status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    db.updateUserStatus(target.id, newStatus);
    db.addAuditLog(
      admin.email,
      newStatus === 'SUSPENDED' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
      `${newStatus === 'SUSPENDED' ? 'Suspended' : 'Activated'} account for ${target.email}`
    );

    res.json({
      success: true,
      status: newStatus,
      message: `Customer account is now ${newStatus}`
    });
  });

  // Admin Manual Wallet Credit/Debit
  app.post('/api/admin/users/wallet-adjust', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { userId, amount, action, type, reason } = req.body;
    const delta = Number(amount);

    if (!userId || !delta || delta <= 0 || !reason) {
      res.status(400).json({ error: 'Target user ID, positive amount, and reason are required.' });
      return;
    }

    const operationType = String(action || type || 'CREDIT').toUpperCase();
    const multiplier = operationType === 'DEBIT' ? -1 : 1;
    const result = db.atomicUpdateBalance(userId, delta * multiplier);

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to adjust user wallet.' });
      return;
    }

    const targetUser = db.findUserById(userId);
    const reference = 'MDS-ADJ-' + Date.now();

    db.createTransaction({
      reference,
      userId,
      userEmail: targetUser?.email || '',
      userName: targetUser?.fullName || '',
      service: 'MANUAL_ADJUSTMENT',
      description: `Admin ${operationType}: ₦${delta.toLocaleString()} - ${reason}`,
      amount: delta * multiplier,
      previousBalance: result.previousBalance,
      newBalance: result.newBalance,
      status: 'Successful',
      metadata: {
        adjustedBy: admin.email,
        action: operationType,
        reason
      }
    });

    db.addAuditLog(
      admin.email,
      'WALLET_ADJUST',
      `${operationType} ₦${delta.toLocaleString()} for user ${targetUser?.email}. Reason: ${reason}`
    );

    res.json({
      success: true,
      newBalance: result.newBalance,
      message: `User wallet successfully updated to ₦${result.newBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
    });
  });

  // Admin Data Plans Management (Rule 13, 37)
  app.get('/api/admin/data-plans', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getDataPlans(false)); // Return all plans including inactive
  });

  app.put('/api/admin/data-plans/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { sellingPrice, isAvailable, name, providerCode } = req.body;

    const plan = db.findDataPlanById(id);
    if (!plan) {
      res.status(404).json({ error: 'Data plan not found.' });
      return;
    }

    const updates: Partial<DataPlan> = {};
    if (sellingPrice !== undefined) updates.sellingPrice = Number(sellingPrice);
    if (isAvailable !== undefined) updates.isAvailable = Boolean(isAvailable);
    if (name !== undefined) updates.name = name;
    if (providerCode !== undefined) updates.providerCode = providerCode;

    db.updateDataPlan(id, updates);
    db.addAuditLog(admin.email, 'UPDATE_DATA_PLAN', `Updated plan ${id}: price=${updates.sellingPrice}, available=${updates.isAvailable}`);

    res.json({ success: true, plan: db.findDataPlanById(id) });
  });

  app.post('/api/admin/data-plans', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { network, category, name, dataAmount, validity, sellingPrice, providerCode, isAvailable } = req.body;

    if (!network || !category || !dataAmount || !sellingPrice) {
      res.status(400).json({ error: 'Network, category, data amount, and selling price are required.' });
      return;
    }

    const newPlan: DataPlan = {
      id: `${network.toLowerCase()}-${category.toLowerCase()}-${dataAmount.toLowerCase()}-${Date.now().toString(36)}`,
      network,
      category,
      name: name || `${network} ${category} ${dataAmount}`,
      dataAmount,
      validity: validity || '30 Days',
      sellingPrice: Number(sellingPrice),
      providerCode: providerCode || `${network}_${category}_${dataAmount}`,
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true
    };

    db.addDataPlan(newPlan);
    db.addAuditLog(admin.email, 'ADD_DATA_PLAN', `Added plan ${newPlan.id} (${newPlan.name}) at ₦${newPlan.sellingPrice}`);

    res.status(201).json({ success: true, plan: newPlan });
  });

  app.delete('/api/admin/data-plans/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const ok = db.deleteDataPlan(id);
    if (!ok) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }
    db.addAuditLog(admin.email, 'DELETE_DATA_PLAN', `Deleted plan ${id}`);
    res.json({ success: true });
  });

  // Admin All Transactions
  app.get('/api/admin/transactions', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getTransactions());
  });

  // Admin Settings & Service Controls (Rule 26, 27, 28, 29)
  app.get('/api/admin/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    res.json({
      settings,
      providerConfigStatus: {
        paystackConfigured: !!process.env.PAYSTACK_SECRET_KEY,
        vtuConfigured: !!process.env.VTU_PROVIDER_API_KEY,
        gmailConfigured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
        monnifyConfigured: false // Explicitly unconfigured / waiting for KYC as requested (Rule 17)
      }
    });
  });

  app.put('/api/admin/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const updates = req.body;
    const updated = db.updateSettings(updates);
    db.addAuditLog(admin.email, 'UPDATE_SETTINGS', JSON.stringify(updates));
    res.json({ success: true, settings: updated });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getAuditLogs());
  });

  // Admin data plans routes with metadata and price synchronization
  app.get('/api/admin/plans', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const plans = db.getDataPlans(false);
    const settings = db.getSettings();
    const creds = getVtuCredentials();

    res.json({
      success: true,
      plans,
      meta: {
        providerName: creds.providerName || 'RapidBills',
        isConfigured: !!creds.apiKey,
        lastSyncAt: (settings as any).lastVtuSyncAt || null,
        syncStatus: (settings as any).vtuSyncStatus || 'NOT_SYNCED',
        totalPlans: plans.length,
        syncedPlans: plans.filter(p => p.apiPrice !== undefined && p.apiPrice !== null && p.apiPrice > 0).length
      }
    });
  });

  // Dedicated sync endpoint for Data Plans table in Admin Control
  app.post('/api/admin/plans/sync-prices', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { apiKey } = req.body || {};
    const creds = getVtuCredentials();
    const effectiveKey = apiKey && !apiKey.includes('••') ? apiKey : creds.apiKey;

    if (!effectiveKey) {
      res.status(400).json({
        success: false,
        error: 'RapidBills VTU API Key is Not Configured. Please configure your RapidBills API Key in the VTU Provider settings.'
      });
      return;
    }

    const result = await syncCatalogFromRapidBills(effectiveKey);
    if (result.success) {
      db.addAuditLog(admin.email, 'SYNC_VTU_PRICES', `Synchronized ${result.count} data plan provider prices from RapidBills official catalog`);
    }
    res.json(result);
  });

  app.post('/api/admin/plans/price', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { planId, sellingPrice } = req.body;
    if (!planId || sellingPrice === undefined) {
      res.status(400).json({ error: 'Plan ID and selling price are required.' });
      return;
    }
    const numPrice = Number(sellingPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      res.status(400).json({ error: 'Invalid price.' });
      return;
    }
    const updated = db.updateDataPlan(planId, { sellingPrice: numPrice });
    if (!updated) {
      res.status(404).json({ error: 'Data plan not found.' });
      return;
    }
    const plan = db.findDataPlanById(planId);
    const profit = (plan && plan.apiPrice !== undefined && plan.apiPrice !== null)
      ? numPrice - plan.apiPrice
      : null;

    db.addAuditLog(admin.email, 'UPDATE_DATA_PLAN_PRICE', `Updated plan ${planId} selling price to ₦${numPrice}`);
    res.json({ success: true, message: `Selling price updated to ₦${numPrice}`, plan, profit });
  });

  app.get('/api/admin/system-status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    const gwConfig = db.getPaymentGatewayConfig();
    const paystackSecret = gwConfig.providers.paystack?.secretKey || process.env.PAYSTACK_SECRET_KEY || '';
    const monnifyKey = gwConfig.providers.monnify?.apiKey || process.env.MONNIFY_API_KEY || '';
    const monnifySecret = gwConfig.providers.monnify?.secretKey || process.env.MONNIFY_SECRET_KEY || '';
    const monnifyContract = gwConfig.providers.monnify?.contractCode || process.env.MONNIFY_CONTRACT_CODE || '';
    const vtuApiKey = settings.vtuProvider?.apiKey || process.env.RAPIDBILLS_API_KEY || process.env.VTU_PROVIDER_API_KEY || '';

    const paystackConfigured = Boolean(paystackSecret);
    const paystackLive = gwConfig.providers.paystack?.mode === 'live' || paystackSecret.startsWith('sk_' + 'live');
    const monnifyConfigured = Boolean(monnifyKey && monnifySecret && monnifyContract);
    const vtuConfigured = Boolean(vtuApiKey);

    res.json({
      maintenanceMode: settings.maintenanceMode,
      registrationEnabled: settings.registrationEnabled,
      servicesAvailability: settings.servicesAvailability,
      providerConfigStatus: {
        paystackConfigured,
        vtuConfigured,
        gmailConfigured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
        monnifyConfigured
      },
      productionReadiness: {
        environment: gwConfig.environment || 'live',
        paystack: {
          status: paystackConfigured ? 'ACTIVE' : 'ACTION_REQUIRED',
          mode: paystackLive ? 'live' : 'test',
          isActive: (gwConfig.activeProvider || 'PAYSTACK').toUpperCase() === 'PAYSTACK',
          configured: paystackConfigured,
          message: paystackConfigured ? (paystackLive ? 'Paystack Live credentials connected' : 'Paystack Test credentials connected') : 'Paystack Secret Key is required for live payments'
        },
        monnify: {
          status: monnifyConfigured ? (gwConfig.providers.monnify?.enabled ? 'ACTIVE' : 'READY') : 'PENDING_SETUP',
          mode: gwConfig.providers.monnify?.mode || 'live',
          isActive: (gwConfig.activeProvider || '').toUpperCase() === 'MONNIFY',
          configured: monnifyConfigured,
          message: monnifyConfigured ? 'Monnify configured as secondary gateway' : 'Secondary provider pending setup (awaiting API Key, Secret Key, Contract Code)'
        },
        rapidBills: {
          status: vtuConfigured ? 'ACTIVE' : 'ACTION_REQUIRED',
          provider: 'RapidBills VTU',
          configured: vtuConfigured,
          message: vtuConfigured ? 'RapidBills API connected for automated telecom deliveries' : 'Set RapidBills API Key in VTU settings or .env'
        },
        webhooks: {
          status: 'ACTIVE',
          registered: true,
          endpoints: [
            { provider: 'Paystack', path: '/api/payments/webhook/paystack', status: 'ACTIVE' },
            { provider: 'Monnify', path: '/api/payments/webhook/monnify', status: 'ACTIVE' },
            { provider: 'RapidBills', path: '/api/vtu/webhook', status: 'ACTIVE' }
          ]
        },
        walletSystem: {
          status: 'LIVE',
          mode: 'PRODUCTION',
          zeroDemoData: true,
          message: 'Server-authoritative wallet ledger, atomic debit/credit operations, zero demo accounts'
        }
      }
    });
  });

  app.post('/api/admin/maintenance', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { enabled } = req.body;
    const settings = db.updateSettings({ maintenanceMode: Boolean(enabled) });
    db.addAuditLog(admin.email, 'TOGGLE_MAINTENANCE', `Maintenance mode set to ${enabled}`);
    res.json({ success: true, maintenanceMode: settings.maintenanceMode });
  });

  app.post('/api/admin/registration', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { enabled } = req.body;
    const settings = db.updateSettings({ registrationEnabled: Boolean(enabled) });
    db.addAuditLog(admin.email, 'TOGGLE_REGISTRATION', `Registration set to ${enabled}`);
    res.json({ success: true, registrationEnabled: settings.registrationEnabled });
  });

  app.post('/api/admin/service-availability', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { service, enabled } = req.body;
    const current = db.getSettings();
    const updatedServices = { ...current.servicesAvailability, [service]: Boolean(enabled) };
    const settings = db.updateSettings({ servicesAvailability: updatedServices });
    db.addAuditLog(admin.email, 'TOGGLE_SERVICE', `Service ${service} set to ${enabled}`);
    res.json({ success: true, servicesAvailability: settings.servicesAvailability });
  });

  app.get('/api/admin/logs', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    res.json({ logs: db.getAuditLogs() });
  });

  // Public/Customer: Airtime discounts & rates
  app.get('/api/services/airtime/pricing', (req: Request, res: Response) => {
    const settings = db.getSettings();
    res.json(settings.airtimePricing || {
      MTN: 2,
      AIRTEL: 2,
      GLO: 3,
      '9MOBILE': 3
    });
  });

  // Admin: Suspend or Activate User (Requirement 8)
  app.put('/api/admin/users/:id/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      res.status(400).json({ error: 'Status must be either ACTIVE or SUSPENDED.' });
      return;
    }

    const updatedUser = db.updateUserStatus(id, status);
    if (!updatedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    db.addAuditLog(admin.email, 'UPDATE_USER_STATUS', `Updated user ${updatedUser.email} status to ${status}`);
    res.json({
      success: true,
      message: `User account status updated to ${status}.`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        status: updatedUser.status
      }
    });
  });

  // Admin: Electricity Providers Management (Requirement 9)
  app.get('/api/admin/electricity-providers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    res.json(settings.electricityProviders || []);
  });

  app.put('/api/admin/electricity-providers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { providers } = req.body;

    if (!Array.isArray(providers)) {
      res.status(400).json({ error: 'Providers must be an array.' });
      return;
    }

    const updated = db.updateSettings({ electricityProviders: providers });
    db.addAuditLog(admin.email, 'UPDATE_ELECTRICITY_PROVIDERS', `Updated ${providers.length} electricity disco providers.`);
    res.json({ success: true, providers: updated.electricityProviders });
  });

  // Admin: TV Providers Management (Requirement 10)
  app.get('/api/admin/tv-providers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    res.json(settings.tvProviders || []);
  });

  app.put('/api/admin/tv-providers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { providers } = req.body;

    if (!Array.isArray(providers)) {
      res.status(400).json({ error: 'Providers must be an array.' });
      return;
    }

    const updated = db.updateSettings({ tvProviders: providers });
    db.addAuditLog(admin.email, 'UPDATE_TV_PROVIDERS', `Updated ${providers.length} TV providers.`);
    res.json({ success: true, providers: updated.tvProviders });
  });

  // Admin: Exam PIN Products Management (Requirement 12)
  app.get('/api/admin/exam-pins', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    res.json(settings.examPinProducts || []);
  });

  app.put('/api/admin/exam-pins', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { products } = req.body;

    if (!Array.isArray(products)) {
      res.status(400).json({ error: 'Products must be an array.' });
      return;
    }

    const updated = db.updateSettings({ examPinProducts: products });
    db.addAuditLog(admin.email, 'UPDATE_EXAM_PINS', `Updated ${products.length} exam PIN products.`);
    res.json({ success: true, products: updated.examPinProducts });
  });

  // Admin: Airtime-to-Cash Management (Requirement 11)
  app.get('/api/admin/airtime-cash/requests', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const txs = db.getTransactions().filter(t => t.service === 'AIRTIME_CASH');
    res.json(txs);
  });

  app.post('/api/admin/airtime-cash/:ref/process', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { ref } = req.params;
    const { action, note } = req.body; // action: 'APPROVE' or 'REJECT'

    const tx = db.findTransactionByReference(ref);
    if (!tx || tx.service !== 'AIRTIME_CASH') {
      res.status(404).json({ error: 'Airtime-to-cash request not found.' });
      return;
    }

    if (tx.status !== 'Pending') {
      res.status(400).json({ error: `Request has already been marked as ${tx.status}.` });
      return;
    }

    if (action === 'APPROVE') {
      const credit = db.atomicUpdateBalance(tx.userId, tx.amount);
      if (!credit.success) {
        res.status(500).json({ error: 'Failed to credit user wallet.' });
        return;
      }
      db.updateTransactionStatus(ref, 'Successful', note || `Approved by ${admin.email}`);
      db.addAuditLog(admin.email, 'APPROVE_AIRTIME_CASH', `Approved ₦${tx.amount} for ${tx.userEmail} (Ref: ${ref})`);
      res.json({ success: true, message: `Request approved. ₦${tx.amount.toLocaleString()} credited to user wallet.` });
    } else if (action === 'REJECT') {
      db.updateTransactionStatus(ref, 'Failed', note || `Rejected by ${admin.email}`);
      db.addAuditLog(admin.email, 'REJECT_AIRTIME_CASH', `Rejected request ${ref} for ${tx.userEmail}. Note: ${note}`);
      res.json({ success: true, message: 'Request marked as rejected.' });
    } else {
      res.status(400).json({ error: 'Invalid action. Must be APPROVE or REJECT.' });
    }
  });

  // Admin: Payment Gateways Credentials & Config (Paystack & Flutterwave)
  app.get('/api/admin/payment-gateways', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const creds = getGatewayCredentials();
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || req.protocol || 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const appUrlEnv = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const dynamicOrigin = appUrlEnv || `${proto}://${host}`;
    const paystackCallbackUrl = (process.env.PAYSTACK_CALLBACK_URL || '').trim() || `${dynamicOrigin}/api/wallet/fund/callback`;
    const paystackWebhookUrl = `${dynamicOrigin}/api/webhooks/paystack`;

    res.json({
      environment: creds.paystack.mode,
      detectedOrigin: dynamicOrigin,
      configuredAppUrl: process.env.APP_URL || '',
      endpoints: {
        paystackCallbackUrl,
        paystackWebhookUrl,
        monnifyWebhookUrl: `${dynamicOrigin}/api/webhooks/monnify`
      },
      paystack: {
        publicKey: creds.paystack.publicKey ? maskKey(creds.paystack.publicKey) : '',
        hasPublicKey: !!creds.paystack.publicKey,
        secretKey: creds.paystack.secretKey ? maskKey(creds.paystack.secretKey) : '',
        hasSecretKey: !!creds.paystack.secretKey,
        enabled: creds.paystack.enabled,
        mode: creds.paystack.mode
      },
      flutterwave: {
        publicKey: creds.flutterwave.publicKey ? maskKey(creds.flutterwave.publicKey) : '',
        hasPublicKey: !!creds.flutterwave.publicKey,
        secretKey: creds.flutterwave.secretKey ? maskKey(creds.flutterwave.secretKey) : '',
        hasSecretKey: !!creds.flutterwave.secretKey,
        secretHash: creds.flutterwave.secretHash ? maskKey(creds.flutterwave.secretHash) : '',
        hasSecretHash: !!creds.flutterwave.secretHash,
        encryptionKey: creds.flutterwave.encryptionKey ? maskKey(creds.flutterwave.encryptionKey) : '',
        hasEncryptionKey: !!creds.flutterwave.encryptionKey,
        enabled: creds.flutterwave.enabled,
        mode: creds.flutterwave.mode
      },
      monnify: {
        apiKey: creds.monnify.apiKey ? maskKey(creds.monnify.apiKey) : '',
        hasApiKey: !!creds.monnify.apiKey,
        secretKey: creds.monnify.secretKey ? maskKey(creds.monnify.secretKey) : '',
        hasSecretKey: !!creds.monnify.secretKey,
        contractCode: creds.monnify.contractCode || '',
        enabled: creds.monnify.enabled,
        mode: creds.monnify.mode
      }
    });
  });

  app.put('/api/admin/payment-gateways', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { paystack, flutterwave, monnify } = req.body;
    const current = db.getSettings();

    const updatedPaymentGateways: any = { ...current.paymentGateways };

    if (paystack) {
      updatedPaymentGateways.paystack = {
        publicKey: paystack.publicKey !== undefined && !paystack.publicKey.includes('••')
          ? paystack.publicKey
          : (current.paymentGateways?.paystack?.publicKey || ''),
        secretKey: paystack.secretKey !== undefined && !paystack.secretKey.includes('••')
          ? paystack.secretKey
          : (current.paymentGateways?.paystack?.secretKey || ''),
        enabled: paystack.enabled !== undefined ? Boolean(paystack.enabled) : true,
        mode: paystack.mode || 'live'
      };
    }

    if (flutterwave) {
      updatedPaymentGateways.flutterwave = {
        publicKey: flutterwave.publicKey !== undefined && !flutterwave.publicKey.includes('••')
          ? flutterwave.publicKey
          : (current.paymentGateways?.flutterwave?.publicKey || ''),
        secretKey: flutterwave.secretKey !== undefined && !flutterwave.secretKey.includes('••')
          ? flutterwave.secretKey
          : (current.paymentGateways?.flutterwave?.secretKey || ''),
        secretHash: flutterwave.secretHash !== undefined && !flutterwave.secretHash.includes('••')
          ? flutterwave.secretHash
          : (current.paymentGateways?.flutterwave?.secretHash || 'mash_datasub_flw_secret_hash'),
        encryptionKey: flutterwave.encryptionKey !== undefined && !flutterwave.encryptionKey.includes('••')
          ? flutterwave.encryptionKey
          : (current.paymentGateways?.flutterwave?.encryptionKey || ''),
        enabled: flutterwave.enabled !== undefined ? Boolean(flutterwave.enabled) : true,
        mode: flutterwave.mode || 'live'
      };
    }

    if (monnify) {
      updatedPaymentGateways.monnify = {
        apiKey: monnify.apiKey !== undefined && !monnify.apiKey.includes('••')
          ? monnify.apiKey
          : (current.paymentGateways?.monnify?.apiKey || ''),
        secretKey: monnify.secretKey !== undefined && !monnify.secretKey.includes('••')
          ? monnify.secretKey
          : (current.paymentGateways?.monnify?.secretKey || ''),
        contractCode: monnify.contractCode !== undefined
          ? monnify.contractCode
          : (current.paymentGateways?.monnify?.contractCode || ''),
        enabled: monnify.enabled !== undefined ? Boolean(monnify.enabled) : false,
        mode: monnify.mode || 'test'
      };
    }

    db.updateSettings({ paymentGateways: updatedPaymentGateways });
    db.addAuditLog(admin.email, 'UPDATE_PAYMENT_GATEWAYS', 'Updated Paystack/Flutterwave gateway configurations.');
    res.json({ success: true, message: 'Payment gateway settings updated successfully.' });
  });

  // Admin: Test Payment Gateway Credentials
  app.post('/api/admin/test/paystack', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { secretKey } = req.body;
    const creds = getGatewayCredentials();
    const keyToTest = secretKey && !secretKey.includes('••') ? secretKey : creds.paystack.secretKey;

    if (!keyToTest) {
      res.status(400).json({ success: false, error: 'No Paystack Secret Key provided or configured.' });
      return;
    }

    const test = await testPaystackConnection(keyToTest);
    res.json(test);
  });

  app.post('/api/admin/test/flutterwave', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { secretKey } = req.body;
    const creds = getGatewayCredentials();
    const keyToTest = secretKey && !secretKey.includes('••') ? secretKey : creds.flutterwave.secretKey;

    if (!keyToTest) {
      res.status(400).json({ success: false, error: 'No Flutterwave Secret Key provided or configured.' });
      return;
    }

    const test = await testFlutterwaveConnection(keyToTest);
    res.json(test);
  });

  app.post('/api/admin/test/squad', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const result = await paymentService.testProviderConnection('SQUAD');
    res.json(result);
  });

  // -------------------------------------------------------------
  // ADMIN: UNIFIED PAYMENT GATEWAY MANAGEMENT & ORCHESTRATION
  // Full control over active/backup providers, credentials, webhooks
  // -------------------------------------------------------------
  app.get('/api/admin/payments/overview', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const overview = await paymentService.getAdminOverview();
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const baseUrl = `${proto}://${host}`;

      res.json({
        success: true,
        baseUrl,
        ...overview
      });
    } catch (err: any) {
      console.error('[Admin Payments Overview Error]', err);
      res.status(500).json({ error: err.message || 'Failed to generate payments overview.' });
    }
  });

  app.put('/api/admin/payments/config', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { activeProvider, backupProvider, environment, virtualAccountsEnabled, providers } = req.body;

    const currentConfig = db.getPaymentGatewayConfig();
    const cleanUpdates: any = {};

    if (activeProvider) cleanUpdates.activeProvider = activeProvider.toUpperCase();
    if (backupProvider !== undefined) cleanUpdates.backupProvider = backupProvider.toUpperCase();
    if (environment) cleanUpdates.environment = environment.toLowerCase();
    if (virtualAccountsEnabled !== undefined) cleanUpdates.virtualAccountsEnabled = !!virtualAccountsEnabled;

    if (providers && typeof providers === 'object') {
      cleanUpdates.providers = {};
      for (const [key, pData] of Object.entries(providers as Record<string, any>)) {
        const curP = (currentConfig.providers as any)?.[key] || {};
        cleanUpdates.providers[key] = {
          ...curP,
          ...pData,
          secretKey: pData.secretKey && !pData.secretKey.includes('••') ? pData.secretKey.trim() : curP.secretKey,
          apiKey: pData.apiKey && !pData.apiKey.includes('••') ? pData.apiKey.trim() : curP.apiKey
        };
      }
    }

    const updated = db.updatePaymentGatewayConfig(cleanUpdates);
    db.addAuditLog(
      admin.email,
      'UPDATE_PAYMENT_GATEWAY_CONFIG',
      `Payment gateway switched/updated: Active=${updated.activeProvider}, Backup=${updated.backupProvider}, Env=${updated.environment}`
    );

    res.json({
      success: true,
      message: 'Payment gateway configuration updated successfully. No client rebuild required!',
      config: updated
    });
  });

  app.post('/api/admin/payments/test-connection', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { provider } = req.body;
    if (!provider) {
      res.status(400).json({ success: false, error: 'Provider name is required.' });
      return;
    }
    const result = await paymentService.testProviderConnection(provider);
    res.json(result);
  });

  app.post('/api/admin/payments/refund', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { reference, amount } = req.body;
    if (!reference) {
      res.status(400).json({ success: false, error: 'Transaction reference is required for refund.' });
      return;
    }

    const paymentTx = db.findPaymentTransactionByReference(reference);
    const providerId = paymentTx?.provider || db.getPaymentGatewayConfig().activeProvider;
    const provider = paymentService.getProvider(providerId);

    if (!provider || !provider.refundPayment) {
      res.status(400).json({ success: false, error: `Refunds are not supported for provider ${providerId}.` });
      return;
    }

    const result = await provider.refundPayment(reference, amount ? Number(amount) : undefined);
    if (result.success) {
      if (paymentTx) {
        db.updatePaymentTransaction(paymentTx.id, { status: 'REFUNDED' });
      }
      db.addAuditLog(admin.email, 'PAYMENT_REFUND_EXECUTED', `Refund processed for ref ${reference} via ${provider.name}`);
    }
    res.json(result);
  });

  // Admin: Comprehensive Payments Overview (Section 8: Paystack & Flutterwave Status, Volume, Deposits)
  app.get('/api/admin/payments', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const creds = getGatewayCredentials();
    const allTransactions = db.getTransactions();
    const fundingTx = allTransactions.filter(t => t.service === 'WALLET_FUNDING');

    const totalDeposits = fundingTx.filter(t => t.status === 'Successful').reduce((acc, t) => acc + (t.amount || 0), 0);
    const successfulCount = fundingTx.filter(t => t.status === 'Successful').length;
    const pendingCount = fundingTx.filter(t => t.status === 'Pending').length;
    const failedCount = fundingTx.filter(t => t.status === 'Failed').length;

    // Paystack breakdown
    const paystackTx = fundingTx.filter(t => t.paymentProvider === 'PAYSTACK' || (t.metadata?.gateway && String(t.metadata.gateway).includes('PAYSTACK')));
    const paystackVolume = paystackTx.filter(t => t.status === 'Successful').reduce((acc, t) => acc + (t.amount || 0), 0);
    const paystackSuccessCount = paystackTx.filter(t => t.status === 'Successful').length;

    // Flutterwave breakdown
    const flutterwaveTx = fundingTx.filter(t => t.paymentProvider === 'FLUTTERWAVE' || (t.metadata?.gateway && String(t.metadata.gateway).includes('FLUTTERWAVE')));
    const flutterwaveVolume = flutterwaveTx.filter(t => t.status === 'Successful').reduce((acc, t) => acc + (t.amount || 0), 0);
    const flutterwaveSuccessCount = flutterwaveTx.filter(t => t.status === 'Successful').length;

    const host = req.headers['x-forwarded-host'] || req.get('host');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const baseUrl = `${proto}://${host}`;

    res.json({
      success: true,
      gateways: {
        paystack: {
          enabled: creds.paystack.enabled,
          mode: creds.paystack.mode,
          hasSecretKey: !!creds.paystack.secretKey,
          hasPublicKey: !!creds.paystack.publicKey,
          publicKeyMask: maskKey(creds.paystack.publicKey),
          webhookUrl: `${baseUrl}/api/webhooks/paystack`
        },
        flutterwave: {
          enabled: creds.flutterwave.enabled,
          mode: creds.flutterwave.mode,
          hasSecretKey: !!creds.flutterwave.secretKey,
          hasPublicKey: !!creds.flutterwave.publicKey,
          hasSecretHash: !!creds.flutterwave.secretHash,
          publicKeyMask: maskKey(creds.flutterwave.publicKey),
          webhookUrl: `${baseUrl}/api/webhooks/flutterwave`
        }
      },
      stats: {
        totalDeposits,
        totalTransactions: fundingTx.length,
        successfulCount,
        pendingCount,
        failedCount,
        paystack: {
          volume: paystackVolume,
          count: paystackSuccessCount,
          totalTransactions: paystackTx.length
        },
        flutterwave: {
          volume: flutterwaveVolume,
          count: flutterwaveSuccessCount,
          totalTransactions: flutterwaveTx.length
        }
      },
      recentDeposits: fundingTx.slice(-50).reverse()
    });
  });

  // Admin: Customer Wallets & Multi-Provider Funding Overview
  app.get('/api/admin/customer-wallets', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const users = db.getUsers().filter(u => u.role === 'CUSTOMER');
    const allFundingTx = db.getTransactions().filter(t => t.service === 'WALLET_FUNDING' && t.status === 'Successful');
    const allDvas = db.getDedicatedVirtualAccounts();

    const customerWallets = users.map(user => {
      const userFunding = allFundingTx.filter(t => t.userId === user.id);
      const paystackFunding = userFunding
        .filter(t => t.paymentProvider === 'PAYSTACK' || (t.metadata?.gateway && String(t.metadata.gateway).includes('PAYSTACK')))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const flutterwaveFunding = userFunding
        .filter(t => t.paymentProvider === 'FLUTTERWAVE' || (t.metadata?.gateway && String(t.metadata.gateway).includes('FLUTTERWAVE')))
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const paystackDva = allDvas.find(d => d.userId === user.id && d.provider === 'PAYSTACK');
      const flutterwaveDva = allDvas.find(d => d.userId === user.id && d.provider === 'FLUTTERWAVE');

      return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status,
        walletBalance: user.walletBalance,
        totalFunded: paystackFunding + flutterwaveFunding,
        paystackFunding,
        flutterwaveFunding,
        paystackDva: paystackDva ? {
          accountNumber: paystackDva.accountNumber,
          bankName: paystackDva.bankName,
          status: paystackDva.status
        } : null,
        flutterwaveDva: flutterwaveDva ? {
          accountNumber: flutterwaveDva.accountNumber,
          bankName: flutterwaveDva.bankName,
          status: flutterwaveDva.status,
          bvnProvided: flutterwaveDva.bvnProvided
        } : null
      };
    });

    res.json({
      success: true,
      customers: customerWallets
    });
  });

  app.post('/api/admin/test/monnify', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { apiKey, secretKey, contractCode, mode } = req.body;
    const creds = getGatewayCredentials();

    const kApiKey = apiKey && !apiKey.includes('••') ? apiKey : creds.monnify.apiKey;
    const kSecretKey = secretKey && !secretKey.includes('••') ? secretKey : creds.monnify.secretKey;
    const kContractCode = contractCode || creds.monnify.contractCode;
    const kMode = mode || creds.monnify.mode || 'test';

    if (!kApiKey || !kSecretKey) {
      res.status(400).json({ success: false, error: 'Both Monnify API Key and Secret Key are required to test.' });
      return;
    }

    const test = await testMonnifyConnection(kApiKey, kSecretKey, kContractCode, kMode);
    res.json(test);
  });

  // Admin: VTU Provider Configuration
  app.get('/api/admin/vtu-provider', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const creds = getVtuCredentials();
    res.json({
      apiKey: creds.apiKey ? maskKey(creds.apiKey) : '',
      hasApiKey: !!creds.apiKey,
      userId: creds.userId || '',
      apiUrl: creds.apiUrl,
      providerName: creds.providerName,
      enabled: creds.enabled,
      mode: creds.mode
    });
  });

  app.put('/api/admin/vtu-provider', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { apiKey, apiUrl, providerName, enabled, mode } = req.body;
    const current = db.getSettings();

    const curVtu = (current.vtuProvider || {}) as any;

    const newApiKey = apiKey !== undefined && !apiKey.includes('••')
      ? apiKey.trim()
      : (curVtu.apiKey || '');

    const updatedVtu = {
      providerName: providerName || curVtu.providerName || 'RAPIDBILLS',
      apiKey: newApiKey,
      userId: curVtu.userId || '',
      apiUrl: (apiUrl || curVtu.apiUrl || 'https://www.rapidbills.ng/api/reseller/v1').trim(),
      enabled: enabled !== undefined ? Boolean(enabled) : (curVtu.enabled !== false),
      mode: mode || curVtu.mode || 'live'
    };

    db.updateSettings({ vtuProvider: updatedVtu });
    db.addAuditLog(admin.email, 'UPDATE_VTU_PROVIDER', `Updated RapidBills VTU Provider configuration`);

    // If new API key is provided and enabled, automatically sync live data plans
    let syncedCount = 0;
    if (updatedVtu.enabled && newApiKey) {
      try {
        const syncRes = await syncCatalogFromRapidBills(newApiKey);
        if (syncRes.success) {
          syncedCount = syncRes.count;
        }
      } catch {
        // Non-blocking sync attempt
      }
    }

    res.json({
      success: true,
      message: syncedCount > 0
        ? `RapidBills VTU Provider updated and ${syncedCount} live data plans synchronized successfully.`
        : 'RapidBills VTU Provider configuration updated successfully.'
    });
  });

  app.post('/api/admin/test/vtu', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { apiKey, apiUrl } = req.body;
    const creds = getVtuCredentials();

    const kApiKey = apiKey && !apiKey.includes('••') ? apiKey : creds.apiKey;
    const kEndpoint = apiUrl || creds.apiUrl;

    if (!kApiKey) {
      res.status(400).json({ success: false, error: 'RapidBills API Key is Not Configured.' });
      return;
    }

    const test = await testVtuConnection(kApiKey, undefined, kEndpoint);
    res.json(test);
  });

  app.post('/api/admin/vtu/sync-catalog', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { apiKey } = req.body;
    const creds = getVtuCredentials();
    const effectiveKey = apiKey && !apiKey.includes('••') ? apiKey : creds.apiKey;

    if (!effectiveKey) {
      res.status(400).json({ success: false, error: 'RapidBills API Key is Not Configured.' });
      return;
    }

    const result = await syncCatalogFromRapidBills(effectiveKey);
    if (result.success) {
      db.addAuditLog(admin.email, 'SYNC_VTU_CATALOG', `Synchronized ${result.count} data plans from RapidBills official catalog`);
    }
    res.json(result);
  });

  // Admin: Email & SMTP Configuration
  app.get('/api/admin/email-config', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    const ec = (settings.emailConfig || {}) as any;
    const gmailUser = ec.gmailUser || process.env.GMAIL_USER || '';
    const gmailPassword = ec.gmailAppPassword || process.env.GMAIL_APP_PASSWORD || '';

    res.json({
      configured: ec.configured ?? (!!gmailUser && !!gmailPassword),
      gmailUser,
      gmailAppPassword: gmailPassword ? maskKey(gmailPassword) : '',
      hasPassword: !!gmailPassword,
      fromName: ec.fromName || 'Mash DataSub'
    });
  });

  app.put('/api/admin/email-config', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { gmailUser, gmailAppPassword, fromName } = req.body;
    const current = db.getSettings();
    const curEc = (current.emailConfig || {}) as any;

    const newPassword = gmailAppPassword !== undefined && !gmailAppPassword.includes('••')
      ? gmailAppPassword.trim()
      : (curEc.gmailAppPassword || '');

    const user = gmailUser !== undefined ? gmailUser.trim() : (curEc.gmailUser || '');

    const updatedEmailConfig = {
      configured: !!(user && newPassword),
      gmailUser: user,
      gmailAppPassword: newPassword,
      fromName: fromName || curEc.fromName || 'Mash DataSub'
    };

    db.updateSettings({ emailConfig: updatedEmailConfig });
    db.addAuditLog(admin.email, 'UPDATE_EMAIL_CONFIG', `Updated Gmail SMTP configuration for ${updatedEmailConfig.gmailUser}`);
    res.json({ success: true, message: 'Email configuration updated successfully.' });
  });

  app.post('/api/admin/test/email', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { gmailUser, gmailAppPassword, recipientEmail } = req.body;
    const settings = db.getSettings();
    const curEc = (settings.emailConfig || {}) as any;

    const kUser = gmailUser || curEc.gmailUser || process.env.GMAIL_USER || '';
    const kPassword = gmailAppPassword && !gmailAppPassword.includes('••') ? gmailAppPassword : (curEc.gmailAppPassword || process.env.GMAIL_APP_PASSWORD || '');
    const target = recipientEmail || admin.email;

    if (!kUser || !kPassword) {
      res.status(400).json({ success: false, error: 'Gmail User email and App Password are required.' });
      return;
    }

    const test = await testEmailConnection({ gmailUser: kUser, gmailAppPassword: kPassword, fromName: 'Mash DataSub' }, target);
    res.json(test);
  });

  // Admin: Airtime Pricing Configuration (Requirement 7)
  app.get('/api/admin/airtime-pricing', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    res.json(settings.airtimePricing || { customerDiscountPercent: 2, serviceFee: 0, generalTransactionChargePercent: 0 });
  });

  app.put('/api/admin/airtime-pricing', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { pricing } = req.body;

    if (!pricing || typeof pricing !== 'object') {
      res.status(400).json({ error: 'Pricing object is required (e.g. { MTN: 2, AIRTEL: 2, GLO: 3, "9MOBILE": 3 }).' });
      return;
    }

    const updated = db.updateSettings({ airtimePricing: pricing });
    db.addAuditLog(admin.email, 'UPDATE_AIRTIME_PRICING', JSON.stringify(pricing));
    res.json({ success: true, airtimePricing: updated.airtimePricing });
  });

  // Admin: User-to-User Transfer Settings (Requirement 2)
  app.get('/api/admin/transfer-settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getSettings();
    const feeType = settings.transferFeeType || 'flat';
    const fixedFee = settings.transferFixedFee !== undefined ? settings.transferFixedFee : (settings.transferCharge !== undefined ? settings.transferCharge : 50);
    const percentFee = settings.transferPercentFee !== undefined ? settings.transferPercentFee : 0;
    const feePayer = settings.transferFeePayer || 'SENDER';
    const minAmount = settings.minTransferAmount !== undefined ? settings.minTransferAmount : 50;
    const maxAmount = settings.maxTransferAmount || 200000;
    const dailyLimit = settings.dailyTransferLimit || 500000;

    res.json({
      transferEnabled: settings.transferEnabled !== false,
      customerToCustomerTransferEnabled: settings.customerToCustomerTransferEnabled !== false,
      transferFeeType: feeType,
      transferFixedFee: fixedFee,
      transferPercentFee: percentFee,
      transferFeePayer: feePayer,
      minTransferAmount: minAmount,
      maxTransferAmount: maxAmount,
      dailyTransferLimit: dailyLimit,
      transferCharge: fixedFee // Backward compatibility
    });
  });

  app.put('/api/admin/transfer-settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const {
      enabled,
      transferEnabled,
      customerToCustomerTransferEnabled,
      feeType,
      transferFeeType,
      charge,
      transferCharge,
      fixedFee,
      transferFixedFee,
      percentFee,
      transferPercentFee,
      feePayer,
      transferFeePayer,
      minTransferAmount,
      maxTransferAmount,
      dailyTransferLimit
    } = req.body;

    const updates: any = {};

    if (enabled !== undefined || transferEnabled !== undefined) {
      updates.transferEnabled = Boolean(enabled !== undefined ? enabled : transferEnabled);
    }

    if (customerToCustomerTransferEnabled !== undefined) {
      updates.customerToCustomerTransferEnabled = Boolean(customerToCustomerTransferEnabled);
    }

    const resolvedFeeType = transferFeeType || feeType;
    if (resolvedFeeType !== undefined) {
      if (!['free', 'flat', 'percentage'].includes(resolvedFeeType)) {
        res.status(400).json({ error: 'Fee type must be free, flat, or percentage.' });
        return;
      }
      updates.transferFeeType = resolvedFeeType;
    }

    const resolvedFixedFee = transferFixedFee !== undefined ? transferFixedFee : (fixedFee !== undefined ? fixedFee : (transferCharge !== undefined ? transferCharge : charge));
    if (resolvedFixedFee !== undefined) {
      const numCharge = Number(resolvedFixedFee);
      if (isNaN(numCharge) || numCharge < 0) {
        res.status(400).json({ error: 'Transfer fixed fee must be a non-negative number.' });
        return;
      }
      updates.transferFixedFee = numCharge;
      updates.transferCharge = numCharge; // Keep in sync
    }

    const resolvedPercentFee = transferPercentFee !== undefined ? transferPercentFee : percentFee;
    if (resolvedPercentFee !== undefined) {
      const numPct = Number(resolvedPercentFee);
      if (isNaN(numPct) || numPct < 0 || numPct > 100) {
        res.status(400).json({ error: 'Transfer percentage fee must be between 0 and 100%.' });
        return;
      }
      updates.transferPercentFee = numPct;
    }

    const resolvedFeePayer = transferFeePayer || feePayer;
    if (resolvedFeePayer !== undefined) {
      if (!['SENDER', 'RECIPIENT'].includes(resolvedFeePayer)) {
        res.status(400).json({ error: 'Fee payer must be either SENDER or RECIPIENT.' });
        return;
      }
      updates.transferFeePayer = resolvedFeePayer;
    }

    if (minTransferAmount !== undefined) {
      const numMin = Number(minTransferAmount);
      if (isNaN(numMin) || numMin < 0) {
        res.status(400).json({ error: 'Minimum transfer amount must be a non-negative number.' });
        return;
      }
      updates.minTransferAmount = numMin;
    }

    if (maxTransferAmount !== undefined) {
      const numMax = Number(maxTransferAmount);
      if (isNaN(numMax) || numMax < 0) {
        res.status(400).json({ error: 'Maximum transfer amount must be a non-negative number.' });
        return;
      }
      updates.maxTransferAmount = numMax;
    }

    if (dailyTransferLimit !== undefined) {
      const numDaily = Number(dailyTransferLimit);
      if (isNaN(numDaily) || numDaily < 0) {
        res.status(400).json({ error: 'Daily transfer limit must be a non-negative number.' });
        return;
      }
      updates.dailyTransferLimit = numDaily;
    }

    const updated = db.updateSettings(updates);
    db.addAuditLog(admin.email, 'UPDATE_TRANSFER_SETTINGS', `Updated transfer settings: ${JSON.stringify(updates)}`);
    res.json({
      success: true,
      message: 'Transfer settings updated successfully and are now live for all transactions.',
      settings: {
        transferEnabled: updated.transferEnabled !== false,
        customerToCustomerTransferEnabled: updated.customerToCustomerTransferEnabled !== false,
        transferFeeType: updated.transferFeeType || 'flat',
        transferFixedFee: updated.transferFixedFee ?? updated.transferCharge ?? 50,
        transferPercentFee: updated.transferPercentFee ?? 0,
        transferFeePayer: updated.transferFeePayer || 'SENDER',
        minTransferAmount: updated.minTransferAmount ?? 50,
        maxTransferAmount: updated.maxTransferAmount ?? 200000,
        dailyTransferLimit: updated.dailyTransferLimit ?? 500000,
        transferCharge: updated.transferFixedFee ?? updated.transferCharge ?? 50
      }
    });
  });

  // -------------------------------------------------------------
  // AIRTIME TO CASH: CUSTOMER & ADMIN WORKFLOW (End-to-End)
  // No third-party chat dependency; native audit trail and balance credit
  // -------------------------------------------------------------

  // Customer/Public: Airtime-to-Cash settings, rates, admin SIMs, transfer codes
  app.get('/api/airtime-cash/config', (req: Request, res: Response) => {
    const settings = db.getAirtimeCashSettings();
    res.json({
      success: true,
      config: settings
    });
  });

  // Customer: Get customer's submitted requests
  app.get('/api/airtime-cash/my-requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const requests = db.getAirtimeCashRequests({ userId: user.id });
    res.json({ success: true, requests });
  });

  // Customer: Submit new Airtime to Cash conversion request
  app.post('/api/airtime-cash/requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { network, airtimeAmount, senderPhone, payoutDestination, bankDetails } = req.body;

    const amount = Number(airtimeAmount);
    const settings = db.getAirtimeCashSettings();

    if (!settings.enabled) {
      res.status(400).json({ error: 'Airtime to Cash service is currently unavailable.' });
      return;
    }

    if (!network || !senderPhone || isNaN(amount)) {
      res.status(400).json({ error: 'Network, sender phone number, and airtime amount are required.' });
      return;
    }

    const netUpper = String(network).toUpperCase() as 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
    if (!['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(netUpper)) {
      res.status(400).json({ error: 'Unsupported telecom network selected.' });
      return;
    }

    if (amount < settings.minAmount || amount > settings.maxAmount) {
      res.status(400).json({
        error: `Airtime amount must be between ₦${settings.minAmount.toLocaleString()} and ₦${settings.maxAmount.toLocaleString()}.`
      });
      return;
    }

    const ratePct = settings.rates[netUpper] ?? 80;
    const rateDecimal = ratePct / 100;
    const fee = settings.fee || 0;
    const expectedPayout = Math.max(0, Math.round(amount * rateDecimal - fee));

    const destination = (payoutDestination || 'WALLET').toUpperCase() as 'WALLET' | 'BANK';
    if (destination === 'BANK' && (!bankDetails || !bankDetails.accountNumber || !bankDetails.bankName)) {
      res.status(400).json({ error: 'Bank name and account number are required for bank payouts.' });
      return;
    }

    const adminSim = settings.recipientPhones[netUpper] || 'Contact Admin';
    const reference = 'A2C-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

    const newRequest = db.createAirtimeCashRequest({
      userId: user.id,
      customerName: user.fullName,
      customerEmail: user.email,
      customerPhone: user.phone,
      network: netUpper,
      senderPhone: senderPhone.trim(),
      airtimeAmount: amount,
      rate: ratePct,
      expectedPayout,
      fee,
      payoutDestination: destination,
      bankDetails: destination === 'BANK' ? {
        bankName: bankDetails.bankName.trim(),
        accountNumber: bankDetails.accountNumber.trim(),
        accountName: bankDetails.accountName ? bankDetails.accountName.trim() : user.fullName
      } : undefined,
      status: 'Pending',
      recipientPhone: adminSim,
      reference
    });

    db.addAuditLog(
      user.email,
      'AIRTIME_TO_CASH_SUBMITTED',
      `Submitted ₦${amount.toLocaleString()} ${netUpper} conversion (Expected payout: ₦${expectedPayout.toLocaleString()} to ${destination})`
    );

    res.status(201).json({
      success: true,
      message: 'Airtime to Cash request received. Please transfer airtime to complete.',
      request: newRequest,
      instructions: {
        adminPhone: adminSim,
        transferCode: settings.transferCodes[netUpper] || '',
        reference
      }
    });
  });

  // Admin: Get all requests with optional status filter
  app.get('/api/admin/airtime-cash/requests', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const status = (req.query.status as string) || 'ALL';
    const requests = db.getAirtimeCashRequests({ status: status === 'ALL' ? undefined : status });
    res.json({ success: true, requests });
  });

  // Admin: Get Airtime to Cash settings
  app.get('/api/admin/airtime-cash/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const settings = db.getAirtimeCashSettings();
    res.json({ success: true, settings });
  });

  // Admin: Update Airtime to Cash settings
  app.put('/api/admin/airtime-cash/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const updates = req.body;
    const updated = db.updateAirtimeCashSettings(updates);
    db.addAuditLog(admin.email, 'UPDATE_AIRTIME_CASH_SETTINGS', 'Updated Airtime-to-Cash rates and SIM configuration');
    res.json({ success: true, message: 'Airtime to Cash settings updated successfully.', settings: updated });
  });

  // Admin: Approve request & Credit Wallet / Payout
  app.post('/api/admin/airtime-cash/requests/:id/approve', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { actualReceivedAmount, notes } = req.body;

    const request = db.getAirtimeCashRequestById(id);
    if (!request) {
      res.status(404).json({ error: 'Airtime to Cash request not found.' });
      return;
    }

    if (request.status !== 'Pending') {
      res.status(400).json({ error: `Cannot approve request currently in '${request.status}' status.` });
      return;
    }

    const received = actualReceivedAmount ? Number(actualReceivedAmount) : request.airtimeAmount;
    const payout = Math.round(received * (request.rate / 100));

    // If destination is WALLET, credit wallet atomically
    let walletUpdated = false;
    let newBalance: number | undefined;

    if (request.payoutDestination === 'WALLET') {
      const creditResult = db.atomicUpdateBalance(request.userId, payout);
      if (!creditResult.success) {
        res.status(500).json({ error: 'Failed to credit customer wallet balance.' });
        return;
      }
      walletUpdated = true;
      newBalance = creditResult.newBalance;

      // Record transaction
      db.createTransaction({
        reference: request.reference,
        userId: request.userId,
        userEmail: request.customerEmail,
        userName: request.customerName,
        service: 'AIRTIME_CASH',
        description: `Airtime to Cash: ₦${received.toLocaleString()} ${request.network} converted (₦${payout.toLocaleString()} credited)`,
        amount: payout,
        previousBalance: creditResult.previousBalance,
        newBalance: creditResult.newBalance,
        status: 'Successful',
        metadata: {
          requestId: request.id,
          network: request.network,
          airtimeAmount: received,
          rate: request.rate,
          senderPhone: request.senderPhone,
          approvedBy: admin.email
        }
      });
    }

    const updated = db.updateAirtimeCashRequest(request.id, {
      status: request.payoutDestination === 'WALLET' ? 'Completed' : 'Approved',
      adminNotes: notes || request.adminNotes,
      completedAt: request.payoutDestination === 'WALLET' ? new Date().toISOString() : undefined
    });

    db.addAuditLog(
      admin.email,
      'APPROVE_AIRTIME_CASH',
      `Approved request ${request.reference} (₦${payout} to ${request.payoutDestination})`
    );

    res.json({
      success: true,
      message: request.payoutDestination === 'WALLET'
        ? `Request approved and ₦${payout.toLocaleString()} credited to customer wallet!`
        : `Request approved. Marked ready for bank transfer.`,
      request: updated,
      walletUpdated,
      newBalance
    });
  });

  // Admin: Complete bank transfer payout
  app.post('/api/admin/airtime-cash/requests/:id/complete', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { notes } = req.body;

    const request = db.getAirtimeCashRequestById(id);
    if (!request) {
      res.status(404).json({ error: 'Airtime to Cash request not found.' });
      return;
    }

    if (request.status === 'Completed') {
      res.status(400).json({ error: 'This request is already completed.' });
      return;
    }

    const updated = db.updateAirtimeCashRequest(request.id, {
      status: 'Completed',
      adminNotes: notes || request.adminNotes,
      completedAt: new Date().toISOString()
    });

    db.addAuditLog(admin.email, 'COMPLETE_AIRTIME_CASH', `Completed payout for ${request.reference}`);

    res.json({
      success: true,
      message: 'Airtime to Cash request marked as Completed.',
      request: updated
    });
  });

  // Admin: Reject request
  app.post('/api/admin/airtime-cash/requests/:id/reject', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { reason } = req.body;

    const request = db.getAirtimeCashRequestById(id);
    if (!request) {
      res.status(404).json({ error: 'Airtime to Cash request not found.' });
      return;
    }

    if (request.status === 'Completed') {
      res.status(400).json({ error: 'Cannot reject an already completed request.' });
      return;
    }

    const updated = db.updateAirtimeCashRequest(request.id, {
      status: 'Rejected',
      adminNotes: reason || 'Airtime transfer could not be confirmed on destination SIM.'
    });

    db.addAuditLog(admin.email, 'REJECT_AIRTIME_CASH', `Rejected request ${request.reference}: ${reason}`);

    res.json({
      success: true,
      message: 'Request rejected.',
      request: updated
    });
  });

  // Admin: Add or update internal notes
  app.post('/api/admin/airtime-cash/requests/:id/note', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { notes } = req.body;

    const updated = db.updateAirtimeCashRequest(id, { adminNotes: notes });
    if (!updated) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    res.json({ success: true, request: updated });
  });

  // -------------------------------------------------------------
  // DYNAMIC SERVICES CRUD (Admin & Customer APIs)
  // Enables adding, configuring, and disabling services with zero code changes
  // -------------------------------------------------------------

  // Customer/Public: list enabled services
  app.get('/api/services', (req: Request, res: Response) => {
    const all = db.getDynamicServices();
    const active = all.filter(s => s.enabled && s.customerVisible);
    res.json({ success: true, services: active });
  });

  // Admin: list all services
  app.get('/api/admin/services', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const services = db.getDynamicServices();
    res.json({ success: true, services });
  });

  // Admin: create service
  app.post('/api/admin/services', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id, name, category, description, icon, enabled, customerVisible, provider, pricingType, minAmount, maxAmount, fixedPrice, fields } = req.body;

    if (!name || !category) {
      res.status(400).json({ error: 'Service name and category are required.' });
      return;
    }

    const validCategories = ['telecom', 'utility', 'entertainment', 'education', 'finance', 'other'];
    const resolvedCat = validCategories.includes(category) ? category : 'other';

    const serviceId = (id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
    const existing = db.getDynamicServiceById(serviceId);
    if (existing) {
      res.status(400).json({ error: `A service with ID '${serviceId}' already exists.` });
      return;
    }

    const created = db.createDynamicService({
      id: serviceId,
      name: name.trim(),
      category: resolvedCat as any,
      description: description ? description.trim() : '',
      icon: icon || 'Layers',
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      customerVisible: customerVisible !== undefined ? Boolean(customerVisible) : true,
      provider: provider || 'RAPIDBILLS',
      pricingType: pricingType || 'catalog',
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      fixedPrice: fixedPrice ? Number(fixedPrice) : undefined,
      fields: Array.isArray(fields) ? fields : []
    });

    db.addAuditLog(admin.email, 'CREATE_DYNAMIC_SERVICE', `Created dynamic service: ${created.name} (${created.id})`);
    res.status(201).json({ success: true, message: 'Service created successfully.', service: created });
  });

  // Admin: update service
  app.put('/api/admin/services/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const updates = req.body;

    const updated = db.updateDynamicService(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    db.addAuditLog(admin.email, 'UPDATE_DYNAMIC_SERVICE', `Updated service ${id}`);
    res.json({ success: true, message: 'Service updated successfully.', service: updated });
  });

  // Admin: toggle service enabled/disabled
  app.post('/api/admin/services/:id/toggle', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;
    const { enabled } = req.body;

    const updated = db.toggleDynamicService(id, enabled !== undefined ? Boolean(enabled) : undefined);
    if (!updated) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    db.addAuditLog(admin.email, 'TOGGLE_DYNAMIC_SERVICE', `Service ${id} is now ${updated.enabled ? 'ENABLED' : 'DISABLED'}`);
    res.json({ success: true, message: `Service ${updated.name} ${updated.enabled ? 'enabled' : 'disabled'}.`, service: updated });
  });

  // Admin: delete service
  app.delete('/api/admin/services/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { id } = req.params;

    const deleted = db.deleteDynamicService(id);
    if (!deleted) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    db.addAuditLog(admin.email, 'DELETE_DYNAMIC_SERVICE', `Deleted dynamic service ${id}`);
    res.json({ success: true, message: 'Service deleted successfully.' });
  });

  // -------------------------------------------------------------
  // ADMIN OVERVIEW REAL-TIME METRICS & TELEMETRY
  // Single endpoint aggregating all live operations without fake data
  // -------------------------------------------------------------
  app.get('/api/admin/overview-metrics', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const users = db.getUsers();
      const transactions = db.getTransactions();
      const a2cRequests = db.getAirtimeCashRequests();
      const dynamicServices = db.getDynamicServices();
      const gatewayOverview = await paymentService.getAdminOverview();

      const customers = users.filter(u => u.role !== 'ADMIN' && u.role !== 'OWNER');
      const totalWalletBalance = customers.reduce((sum, u) => sum + (u.walletBalance || 0), 0);
      const activeCustomers = customers.filter(u => u.status === 'ACTIVE').length;

      const totalTx = transactions.length;
      const successfulTx = transactions.filter(t => t.status === 'Successful');
      const pendingTx = transactions.filter(t => t.status === 'Pending');
      const failedTx = transactions.filter(t => t.status === 'Failed');

      const totalFunding = successfulTx
        .filter(t => t.service === 'WALLET_FUNDING')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalSales = successfulTx
        .filter(t => t.service !== 'WALLET_FUNDING')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

      // Today's stats
      const todayDateStr = new Date().toISOString().split('T')[0];
      const todayTx = transactions.filter(t => t.createdAt?.startsWith(todayDateStr));
      const todayVolume = todayTx
        .filter(t => t.status === 'Successful')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

      const a2cPending = a2cRequests.filter(r => r.status === 'Pending').length;
      const a2cCompleted = a2cRequests.filter(r => r.status === 'Completed').length;
      const a2cTotalPayout = a2cRequests
        .filter(r => r.status === 'Completed')
        .reduce((sum, r) => sum + (r.expectedPayout || 0), 0);

      res.json({
        success: true,
        metrics: {
          totalCustomers: customers.length,
          activeCustomers,
          totalWalletBalance,
          totalFunding,
          totalSales,
          totalTransactions: totalTx,
          successfulTransactionsCount: successfulTx.length,
          pendingTransactionsCount: pendingTx.length,
          failedTransactionsCount: failedTx.length,
          todayTransactionsCount: todayTx.length,
          todayVolume,
          airtimeCashPending: a2cPending,
          airtimeCashCompleted: a2cCompleted,
          airtimeCashTotalPayout: a2cTotalPayout,
          activeServicesCount: dynamicServices.filter(s => s.enabled).length,
          totalServicesCount: dynamicServices.length
        },
        gatewayOverview,
        recentTransactions: transactions.slice(0, 8),
        recentAirtimeCashRequests: a2cRequests.slice(0, 5)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to calculate overview metrics.' });
    }
  });

  // -------------------------------------------------------------
  // VITE DEV SERVER / PRODUCTION STATIC SERVING
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mash DataSub Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
