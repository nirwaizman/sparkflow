/**
 * @sparkflow/realtime — public API.
 *
 * Barrel for the realtime collaboration primitives. Prefer named imports
 * from this module over deep-path imports except where the deep path is
 * explicitly declared in package.json `exports` (provider, presence, share).
 */
export * from "./provider/yjs";
export * from "./presence";
export * from "./share/links";
