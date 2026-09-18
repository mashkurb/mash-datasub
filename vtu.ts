import { DataPlan, db } from './db';

export interface VtuPurchaseResult {
  success: boolean;
  providerReference?: string;
  providerResponse?: string;
  isPending?: boolean;
  error?: string;
}

// Official RapidBills Network Provider Mapping from official catalog
export const RAPIDBILLS_PROVIDERS: Record<string, number> = {
  MTN: 1,
  GLO: 2,
  AIRTEL: 3,
  '9MOBILE': 4,
  SMILE: 5
};

// Official RapidBills Electricity Disco Provider Mapping from official catalog
export const RAPIDBILLS_POWER_PROVIDERS: Record<string, number> = {
  AEDC: 1,   // Abuja Electric AEDC
  EKEDC: 2,  // Eko Electric (EKEDC)
  IBEDC: 3,  // Ibadan Electric (IBEDC)
  IKEDC: 4,  // Ikeja Electric (IKEDC)
  KAEDCO: 5, // Kaduna Electric
  PHED: 6,   // Port Harcourt Electric
  JED: 7,    // Jos Electric
  EEDC: 8,   // Enugu Electric
  YEDC: 9,   // Yola Electric
  BEDC: 10   // Benin Electric
};

export function getVtuCredentials() {
  const settings = db.getSettings();
  const vtu = (settings.vtuProvider || {}) as any;

  const apiKey = vtu.apiKey?.trim() || process.env.VTU_PROVIDER_API_KEY?.trim() || '';
  const userId = vtu.userId?.trim() || process.env.VTU_PROVIDER_USER_ID?.trim() || '';
  const apiUrl = vtu.apiUrl?.trim() || process.env.VTU_PROVIDER_URL?.trim() || 'https://www.rapidbills.ng/api/reseller/v1';
  const enabled = vtu.enabled !== false && apiKey.length > 0;
  const providerName = vtu.providerName || 'RAPIDBILLS';
  const mode = vtu.mode || 'live';

  return { apiKey, userId, apiUrl, enabled, providerName, mode };
}

/**
 * Test connection to RapidBills using official /user-balance/ endpoint
 */
export async function testVtuConnection(
  apiKeyParam?: string,
  _ignoredUserId?: string,
  apiUrlParam?: string
): Promise<{ success: boolean; message: string; balance?: number }> {
  const { apiKey: configApiKey, apiUrl: configApiUrl } = getVtuCredentials();
  const apiKey = apiKeyParam?.trim() || configApiKey;
  const apiUrl = apiUrlParam?.trim() || configApiUrl || 'https://www.rapidbills.ng/api/reseller/v1';

  if (!apiKey || apiKey.length === 0) {
    return { success: false, message: 'RapidBills API Key is Not Configured.' };
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const balanceEndpoint = cleanUrl.endsWith('/user-balance') || cleanUrl.endsWith('/user-balance/')
    ? cleanUrl
    : `${cleanUrl}/user-balance/`;

  try {
    const response = await fetch(balanceEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    });

    const data = await response.json().catch(() => null);

    if (response.ok && (data?.status === 'true' || data?.status === true)) {
      const mainBalance = data?.data?.main_balance !== undefined ? parseFloat(data.data.main_balance) : 0;
      return {
        success: true,
        message: `Connected to RapidBills Reseller API successfully! Live API Balance: ₦${mainBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
        balance: mainBalance
      };
    }

    if (response.status === 403 || response.status === 401) {
      return {
        success: false,
        message: data?.detail || data?.message || 'Invalid or expired RapidBills API Key. Access denied.'
      };
    }

    return {
      success: false,
      message: data?.message || `RapidBills API returned HTTP ${response.status}.`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to reach RapidBills API endpoint: ${err.message}`
    };
  }
}

/**
 * Synchronize real data plans directly from official RapidBills /catalog/ endpoint
 */
export async function syncCatalogFromRapidBills(apiKeyOverride?: string): Promise<{
  success: boolean;
  count: number;
  message: string;
  plans?: DataPlan[];
  syncedAt?: string;
}> {
  const { apiKey: configApiKey, apiUrl } = getVtuCredentials();
  const apiKey = apiKeyOverride?.trim() || configApiKey;

  if (!apiKey) {
    return {
      success: false,
      count: 0,
      message: 'RapidBills VTU provider is Not Configured. Please configure API key first.'
    };
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const catalogEndpoint = cleanUrl.endsWith('/catalog') || cleanUrl.endsWith('/catalog/')
    ? cleanUrl
    : `${cleanUrl}/catalog/`;

  try {
    const response = await fetch(catalogEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      return {
        success: false,
        count: 0,
        message: errData?.detail || errData?.message || `RapidBills catalog request failed with status ${response.status}`
      };
    }

    const json = await response.json();
    const bundles: any[] = json?.data?.bundles || [];

    if (!bundles.length) {
      return {
        success: false,
        count: 0,
        message: 'RapidBills catalog returned 0 active data bundles.'
      };
    }

    const networkMap: Record<string, 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'> = {
      mtn: 'MTN',
      airtel: 'AIRTEL',
      glo: 'GLO',
      '9mobile': '9MOBILE'
    };

    const existingPlans = db.getDataPlans(false);
    const syncTimestamp = new Date().toISOString();
    const matchedBundleIds = new Set<string>();

    const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

    // Work on a copy of existing plans
    const updatedPlans: DataPlan[] = [...existingPlans];

    for (const b of bundles) {
      const net = networkMap[b.network?.toLowerCase()];
      if (!net) continue;

      const planType = (b.plan_type || '').toLowerCase();
      let category: 'SME' | 'Corporate' | 'Gift' = 'Gift';
      if (planType.includes('sme')) {
        category = 'SME';
      } else if (planType.includes('corp')) {
        category = 'Corporate';
      } else {
        category = 'Gift';
      }

      const durationStr = b.duration ? String(b.duration) : '30';
      const validity = durationStr === '1' ? '1 Day' : (durationStr.includes('Day') ? durationStr : `${durationStr} Days`);
      const providerBundleId = String(b.id);
      const apiPriceVal = parseFloat(b.price || '0');

      matchedBundleIds.add(providerBundleId);

      // 1. Primary match: providerCode or rapidBillsId or explicit rb- ID
      let matchIdx = updatedPlans.findIndex(p =>
        p.providerCode === providerBundleId ||
        (p.rapidBillsId !== undefined && String(p.rapidBillsId) === providerBundleId) ||
        p.id === `rb-${b.id}`
      );

      // 2. Secondary fallback match: network + category + dataAmount + duration
      if (matchIdx === -1) {
        matchIdx = updatedPlans.findIndex(p =>
          p.network === net &&
          p.category === category &&
          normalize(p.dataAmount) === normalize(b.size) &&
          (normalize(p.validity).includes(durationStr) || (durationStr === '30' && normalize(p.validity).includes('30')))
        );
      }

      if (matchIdx !== -1) {
        // Matched existing plan:
        // PRESERVE existing Selling Price! Update read-only apiPrice, provider IDs, and sync metadata.
        const existing = updatedPlans[matchIdx];
        updatedPlans[matchIdx] = {
          ...existing,
          providerCode: providerBundleId,
          rapidBillsId: providerBundleId,
          apiPrice: apiPriceVal,
          providerName: 'RapidBills',
          lastSyncAt: syncTimestamp,
          syncStatus: 'SYNCED',
          isAvailable: true
        };
      } else {
        // New plan from RapidBills: add without creating duplicate
        const initialSellingPrice = Math.max(apiPriceVal + 10, Math.ceil(apiPriceVal * 1.05));
        updatedPlans.push({
          id: `rb-${b.id}`,
          network: net,
          category,
          name: `${net} ${category} ${b.size} (${validity})`,
          dataAmount: b.size || '1GB',
          validity,
          sellingPrice: initialSellingPrice,
          apiPrice: apiPriceVal,
          providerCode: providerBundleId,
          rapidBillsId: providerBundleId,
          providerName: 'RapidBills',
          lastSyncAt: syncTimestamp,
          syncStatus: 'SYNCED',
          isAvailable: true
        });
      }
    }

    // Mark plans that were previously synced from RapidBills but are missing from latest catalog as UNAVAILABLE (do not delete)
    for (let i = 0; i < updatedPlans.length; i++) {
      const p = updatedPlans[i];
      if (p.rapidBillsId && !matchedBundleIds.has(String(p.rapidBillsId))) {
        updatedPlans[i] = {
          ...p,
          syncStatus: 'UNAVAILABLE',
          isAvailable: false
        };
      }
    }

    // Persist real live plans in database
    if (updatedPlans.length > 0) {
      db.setDataPlans(updatedPlans);
    }

    db.updateSettings({
      lastVtuSyncAt: syncTimestamp,
      vtuSyncStatus: 'SYNCED',
      vtuSyncCount: bundles.length
    } as any);

    return {
      success: true,
      count: bundles.length,
      message: `Successfully synchronized ${bundles.length} live product prices from RapidBills official catalog.`,
      plans: updatedPlans,
      syncedAt: syncTimestamp
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: `Failed to fetch RapidBills catalog: ${err.message}`
    };
  }
}

/**
 * Buy Data Bundle from RapidBills Reseller API
 * Endpoint: POST /buy-data/
 * Payload: { bundle_id: number, number: string, wallet: 'main' }
 */
export async function purchaseDataFromProvider(
  phone: string,
  plan: DataPlan,
  reference: string
): Promise<VtuPurchaseResult> {
  const { apiKey, apiUrl, enabled } = getVtuCredentials();

  if (!enabled || !apiKey) {
    return {
      success: false,
      error: 'RapidBills VTU provider is Not Configured. Please set your RapidBills API Key in the Admin Panel.'
    };
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/buy-data/`;

  try {
    const rawId = plan.rapidBillsId !== undefined ? String(plan.rapidBillsId) : plan.providerCode;
    const bundleId = parseInt(rawId, 10);
    if (isNaN(bundleId)) {
      return {
        success: false,
        error: `RapidBills bundle ID is not synced for this plan (${plan.name}). Please sync provider prices in Admin Panel.`
      };
    }

    const payload = {
      bundle_id: bundleId,
      number: phone.trim(),
      wallet: 'main'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': reference
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status === 'false' || data?.status === false) {
      return {
        success: false,
        error: data?.message || data?.detail || `RapidBills rejected purchase (HTTP ${response.status})`,
        providerResponse: JSON.stringify(data)
      };
    }

    const status = (data?.status || '').toString().toLowerCase();
    if (status === 'true' || status === 'success' || status === 'successful') {
      return {
        success: true,
        providerReference: data?.data?.reference || data?.reference || reference,
        providerResponse: JSON.stringify(data)
      };
    } else if (status === 'pending' || status === 'processing') {
      return {
        success: true,
        isPending: true,
        providerReference: data?.data?.reference || reference,
        providerResponse: JSON.stringify(data)
      };
    } else {
      return {
        success: false,
        error: data?.message || 'RapidBills transaction status unverified.',
        providerResponse: JSON.stringify(data)
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Could not reach RapidBills provider API: ${err.message}`
    };
  }
}

/**
 * Buy Airtime from RapidBills Reseller API
 * Endpoint: POST /buy-airtime/
 * Payload: { provider_id: number, number: string, amount: number, wallet: 'main' }
 */
export async function purchaseAirtimeFromProvider(
  network: string,
  phone: string,
  amount: number,
  reference: string
): Promise<VtuPurchaseResult> {
  const { apiKey, apiUrl, enabled } = getVtuCredentials();

  if (!enabled || !apiKey) {
    return {
      success: false,
      error: 'RapidBills VTU provider is Not Configured. Please set your RapidBills API Key in the Admin Panel.'
    };
  }

  const providerId = RAPIDBILLS_PROVIDERS[network.toUpperCase()];
  if (!providerId) {
    return {
      success: false,
      error: `Unsupported network for RapidBills: ${network}`
    };
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/buy-airtime/`;

  try {
    const payload = {
      provider_id: providerId,
      number: phone.trim(),
      amount: Math.round(amount),
      wallet: 'main'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': reference
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status === 'false' || data?.status === false) {
      return {
        success: false,
        error: data?.message || data?.detail || `RapidBills airtime recharge failed (HTTP ${response.status})`,
        providerResponse: JSON.stringify(data)
      };
    }

    const status = (data?.status || '').toString().toLowerCase();
    if (status === 'true' || status === 'success' || status === 'successful') {
      return {
        success: true,
        providerReference: data?.data?.reference || data?.reference || reference,
        providerResponse: JSON.stringify(data)
      };
    }

    return {
      success: false,
      error: data?.message || 'Airtime dispatch failed at provider.',
      providerResponse: JSON.stringify(data)
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to connect to RapidBills API: ${err.message}`
    };
  }
}

/**
 * Buy Electricity / Power from RapidBills Reseller API
 * Endpoint: POST /buy-power/
 * Payload: { provider_id: number, meter_number: string, meter_type: 1|2, amount: number, wallet: 'main' }
 */
export async function purchaseElectricityFromProvider(
  disco: string,
  meterNumber: string,
  meterType: 'prepaid' | 'postpaid',
  amount: number,
  reference: string
): Promise<VtuPurchaseResult & { token?: string; units?: string }> {
  const { apiKey, apiUrl, enabled } = getVtuCredentials();

  if (!enabled || !apiKey) {
    return {
      success: false,
      error: 'RapidBills VTU provider is Not Configured. Please set your RapidBills API Key in the Admin Panel.'
    };
  }

  const providerId = RAPIDBILLS_POWER_PROVIDERS[disco.toUpperCase()] || 1;
  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/buy-power/`;

  try {
    const payload = {
      provider_id: providerId,
      meter_number: meterNumber.trim(),
      meter_type: meterType === 'postpaid' ? 2 : 1,
      amount: Math.round(amount),
      wallet: 'main'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': reference
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status === 'false' || data?.status === false) {
      return {
        success: false,
        error: data?.message || data?.detail || `Electricity payment rejected (HTTP ${response.status})`,
        providerResponse: JSON.stringify(data)
      };
    }

    return {
      success: true,
      token: data?.data?.token || data?.token,
      units: data?.data?.units || data?.units,
      providerReference: data?.data?.reference || reference,
      providerResponse: JSON.stringify(data)
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to communicate with RapidBills power endpoint: ${err.message}`
    };
  }
}

/**
 * Buy Cable TV Subscription from RapidBills Reseller API
 * Endpoint: POST /buy-cable/
 * Payload: { plan_id: number, card_number: string, wallet: 'main' }
 */
export async function purchaseTvFromProvider(
  _provider: 'DSTV' | 'GOTV' | 'STARTIMES',
  smartcard: string,
  packageCode: string,
  _amount: number,
  reference: string
): Promise<VtuPurchaseResult> {
  const { apiKey, apiUrl, enabled } = getVtuCredentials();

  if (!enabled || !apiKey) {
    return {
      success: false,
      error: 'RapidBills VTU provider is Not Configured. Please set your RapidBills API Key in the Admin Panel.'
    };
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/buy-cable/`;

  try {
    const planId = parseInt(packageCode, 10);
    const payload = {
      plan_id: isNaN(planId) ? 11 : planId,
      card_number: smartcard.trim(),
      wallet: 'main'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': reference
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status === 'false' || data?.status === false) {
      return {
        success: false,
        error: data?.message || data?.detail || `TV subscription failed (HTTP ${response.status})`,
        providerResponse: JSON.stringify(data)
      };
    }

    return {
      success: true,
      providerReference: data?.data?.reference || reference,
      providerResponse: JSON.stringify(data)
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to communicate with RapidBills cable endpoint: ${err.message}`
    };
  }
}
