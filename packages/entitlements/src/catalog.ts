/**
 * Entitlements catalog — single source of truth for what each tier can do.
 *
 * Keep this file the ONLY place where per-tier limits are defined. Both
 * the backend guard and the frontend pricing page read from it. Adding a
 * new feature requires updating every tier so exhaustiveness is enforced
 * by the shared record type.
 *
 * `Infinity` is a legal value and means "unlimited". Guards must handle
 * `Infinity` specifically — never compare against it as a plain number
 * in a UI progress bar.
 */

export const ENTITLEMENTS = {
  free: {
    messagesPerDay: 10,
    filesTotal: 5,
    maxFileMb: 5,
    agentsActive: 1,
    webSearch: true,
    workflowsActive: 0,
    monthlyCostCapUsd: 0,
  },
  pro: {
    messagesPerDay: 500,
    filesTotal: 100,
    maxFileMb: 50,
    agentsActive: 5,
    webSearch: true,
    workflowsActive: 10,
    monthlyCostCapUsd: 25,
  },
  team: {
    messagesPerDay: 2000,
    filesTotal: 500,
    maxFileMb: 100,
    agentsActive: 20,
    webSearch: true,
    workflowsActive: 50,
    monthlyCostCapUsd: 100,
  },
  enterprise: {
    messagesPerDay: Infinity,
    filesTotal: Infinity,
    maxFileMb: 500,
    agentsActive: Infinity,
    webSearch: true,
    workflowsActive: Infinity,
    monthlyCostCapUsd: Infinity,
  },
} as const;

export type FeatureKey = keyof (typeof ENTITLEMENTS)["free"];

export type EntitlementsForTier = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];
