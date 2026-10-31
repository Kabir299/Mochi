import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesError,
  PurchasesPackage,
} from 'react-native-purchases';

// Google Play Billing and Apple In-App Purchase, both through RevenueCat.
// The public SDK keys come from the RevenueCat dashboard (Project → API keys) and are
// safe to ship in the app. With no key, payments are off (see FREE_LAUNCH).
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

// The entitlement identifier set up in RevenueCat that unlocks Pro.
export const ENTITLEMENT = 'pro';

export const paymentsEnabled = Platform.OS !== 'web' && Boolean(API_KEY);

let configured = false;

export function configurePurchases() {
  if (!paymentsEnabled || configured) return;
  Purchases.configure({ apiKey: API_KEY! });
  configured = true;
}

export const hasPro = (info: CustomerInfo) => info.entitlements.active[ENTITLEMENT] !== undefined;

export async function loadPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  // Yearly first: it's the better deal and the one most people pick.
  const order = ['ANNUAL', 'MONTHLY'];
  return [...(offerings.current?.availablePackages ?? [])].sort(
    (a, b) => rank(order, a.packageType) - rank(order, b.packageType),
  );
}

const rank = (order: string[], value: string) =>
  order.includes(value) ? order.indexOf(value) : order.length;

// Resolves to whether Pro is now active; null when the person cancelled.
export async function buy(pkg: PurchasesPackage): Promise<boolean | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasPro(customerInfo);
  } catch (error) {
    if ((error as PurchasesError).userCancelled) return null;
    throw error;
  }
}

export async function restore() {
  return hasPro(await Purchases.restorePurchases());
}

export async function manageUrl() {
  return (await Purchases.getCustomerInfo()).managementURL;
}

// "7-day free trial" if the product has one (Apple: intro price 0, Google: free phase).
export function trialText(pkg: PurchasesPackage) {
  const product = pkg.product;
  const intro = product.introPrice;
  if (intro && intro.price === 0) {
    return `${intro.periodNumberOfUnits}-${intro.periodUnit.toLowerCase()} free trial`;
  }
  const free = product.defaultOption?.freePhase?.billingPeriod;
  if (free) return `${free.value}-${free.unit.toLowerCase()} free trial`;
  return null;
}

export function periodLabel(pkg: PurchasesPackage) {
  if (pkg.packageType === 'ANNUAL') return 'Yearly';
  if (pkg.packageType === 'MONTHLY') return 'Monthly';
  if (pkg.packageType === 'LIFETIME') return 'Lifetime';
  return pkg.product.title;
}

export function perLabel(pkg: PurchasesPackage) {
  if (pkg.packageType === 'ANNUAL') return '/ year';
  if (pkg.packageType === 'MONTHLY') return '/ month';
  return '';
}

export function addProListener(onChange: (pro: boolean) => void) {
  const listener = (info: CustomerInfo) => onChange(hasPro(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
