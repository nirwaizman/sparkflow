/**
 * @sparkflow/entitlements — public API barrel.
 */
export { ENTITLEMENTS, type FeatureKey, type EntitlementsForTier } from "./catalog";
export {
  EntitlementError,
  resolveTier,
  checkEntitlement,
  requireEntitlement,
  type EntitlementResult,
} from "./guard";
