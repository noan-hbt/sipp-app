import { INTRO_ELIGIBILITY_STATUS, PURCHASES_ERROR_CODE, Purchases, type PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { isNative } from './native'

// Public RevenueCat key of the iOS app (appl_...), set at build time.
const KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined

/** In-app purchases can be made here (the iOS app, with RevenueCat configured). */
export const storeAvailable = isNative && !!KEY

let ready: Promise<void> | null = null
let currentUser: string | null = null
// Resolves once the store is configured for a user: screens opened earlier wait for it.
let configured!: () => void
const identified = new Promise<void>((resolve) => (configured = resolve))

async function whenReady() {
  await identified
  await ready
}

/** Ties App Store purchases to the Sipp account, so the server finds them under the user's id. */
export function identify(userId: string): Promise<void> {
  if (!storeAvailable) return Promise.resolve()
  if (!ready) {
    currentUser = userId
    ready = Purchases.configure({ apiKey: KEY!, appUserID: userId })
    configured()
    return ready
  }
  if (currentUser === userId) return ready
  currentUser = userId
  ready = ready.then(() => Purchases.logIn({ appUserID: userId })).then(() => undefined)
  return ready
}

export async function forget(): Promise<void> {
  if (!ready || currentUser === null) return
  currentUser = null
  try {
    await ready
    await Purchases.logOut()
  } catch {
    /* already anonymous */
  }
}

export interface Catalog {
  /** Every App Store package on offer, keyed by product id. */
  packages: Record<string, PurchasesPackage>
  /** Products whose introductory offer this Apple ID can still get (Apple grants it once per subscription group). */
  introEligible: Set<string>
}

export async function catalog(): Promise<Catalog> {
  await whenReady()
  const offerings = await Purchases.getOfferings()
  const packages: Record<string, PurchasesPackage> = {}
  for (const offering of Object.values(offerings.all)) {
    for (const p of offering.availablePackages) packages[p.product.identifier] = p
  }
  const introEligible = new Set<string>()
  try {
    const ids = Object.keys(packages)
    const eligibility = ids.length ? await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: ids }) : {}
    for (const [id, e] of Object.entries(eligibility)) {
      if (e.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) introEligible.add(id)
    }
  } catch {
    // Unknown: never promise a free trial Apple might not give.
  }
  return { packages, introEligible }
}

/** Buys a package; false when the user backed out of Apple's sheet. */
export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  await whenReady()
  try {
    await Purchases.purchasePackage({ aPackage: pkg })
    return true
  } catch (error) {
    const e = error as { code?: unknown; userCancelled?: boolean | null }
    if (e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false
    throw error
  }
}

/** Restores purchases made with this Apple ID (new phone, reinstall). */
export async function restore(): Promise<void> {
  await whenReady()
  await Purchases.restorePurchases()
}
