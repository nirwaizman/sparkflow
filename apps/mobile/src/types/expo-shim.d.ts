/**
 * TODO(sparkflow): DELETE THIS FILE after `pnpm install` in apps/mobile.
 *
 * This shim exists solely so that `tsc --noEmit` can run BEFORE
 * dependencies are installed. It declares a handful of third-party
 * packages (React, React Native, Expo, NativeWind) as `any`-typed modules
 * that accept both default and named imports. Nothing here fabricates
 * prop / return / component types — the shape is deliberately just `any`
 * so that once the real `@types/react`, `react-native`, `expo`,
 * `expo-router`, `expo-secure-store`, `expo-document-picker`,
 * `expo-status-bar`, and `nativewind` types land after `pnpm install`,
 * they take over entirely.
 *
 * ACTION REQUIRED AFTER `pnpm install`:
 *   1. Delete this file.
 *   2. Remove the "src/types/expo-shim.d.ts" entry from tsconfig.json's
 *      include list.
 *
 * Leaving the shim in place WILL cause real type errors in imports from
 * these packages to be silently swallowed — that is the point of this
 * warning.
 */

// Each module declares `const x: any; export = x;` AND individually
// enumerated `any`-typed re-exports. `export =` alone does not permit
// named ES imports under esModuleInterop, so named symbols our code
// actually uses are re-exported explicitly. Any NEW named import added to
// our source after this shim was written will trigger a real TS2305 —
// which is the correct failure mode, forcing a shim update rather than
// hiding bugs.

declare module "react" {
  const mod: any;
  export default mod;
  export const Fragment: any;
  export const StrictMode: any;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: ReadonlyArray<any>): T;
  export const useEffect: (effect: () => any, deps?: ReadonlyArray<any>) => void;
  export const useLayoutEffect: (effect: () => any, deps?: ReadonlyArray<any>) => void;
  export function useMemo<T>(fn: () => T, deps: ReadonlyArray<any>): T;
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void];
  export function useState<T = undefined>(): [T | undefined, (next: T | ((prev: T | undefined) => T | undefined)) => void];
  export const useContext: any;
  export const useReducer: any;
  export const createContext: any;
  export const forwardRef: any;
  export const memo: any;
  export type ReactNode = any;
  export type ReactElement = any;
  export type ComponentType<P = any> = any;
  export type FC<P = any> = any;
  export type PropsWithChildren<P = any> = any;
}
declare module "react/jsx-runtime" {
  const mod: any;
  export default mod;
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react-native" {
  const mod: any;
  export default mod;
  export const ActivityIndicator: any;
  export const Alert: any;
  // FlatList is both a value and a type (FlatList<T>) in real RN.
  export const FlatList: any;
  export type FlatList<ItemT = any> = any;
  export const I18nManager: any;
  export const Image: any;
  export const KeyboardAvoidingView: any;
  export const Platform: any;
  export const Pressable: any;
  export const SafeAreaView: any;
  export const ScrollView: any;
  export const StyleSheet: any;
  export const Text: any;
  export const TextInput: any;
  export const TouchableOpacity: any;
  export const View: any;
}
declare module "react-native-gesture-handler" {
  const mod: any;
  export = mod;
}
declare module "react-native-reanimated" {
  const mod: any;
  export = mod;
}
declare module "react-native-safe-area-context" {
  const mod: any;
  export default mod;
  export const SafeAreaProvider: any;
  export const SafeAreaView: any;
  export const useSafeAreaInsets: any;
}
declare module "react-native-screens" {
  const mod: any;
  export = mod;
}

declare module "expo" {
  const mod: any;
  export = mod;
}
declare module "expo-router" {
  const mod: any;
  export default mod;
  export const Stack: any;
  export const Tabs: any;
  export const Slot: any;
  export const Link: any;
  export const Redirect: any;
  export const useRouter: any;
  export const useLocalSearchParams: any;
  export const usePathname: any;
}
declare module "expo-router/entry" {
  const mod: any;
  export = mod;
}
declare module "expo-secure-store" {
  const mod: any;
  export default mod;
  export const getItemAsync: any;
  export const setItemAsync: any;
  export const deleteItemAsync: any;
  export const isAvailableAsync: any;
}
declare module "expo-document-picker" {
  const mod: any;
  export default mod;
  export const getDocumentAsync: any;
  export type DocumentPickerResult = any;
  export type DocumentPickerAsset = any;
}
declare module "expo-status-bar" {
  const mod: any;
  export default mod;
  export const StatusBar: any;
}
declare module "expo-constants" {
  const mod: any;
  export default mod;
}

declare module "nativewind" {
  const mod: any;
  export = mod;
}
declare module "nativewind/preset" {
  const mod: any;
  export = mod;
}
declare module "nativewind/babel" {
  const mod: any;
  export = mod;
}
declare module "nativewind/metro" {
  const mod: any;
  export default mod;
  export const withNativeWind: any;
}
declare module "nativewind/types";

// CSS entry consumed by Metro/NativeWind
declare module "*.css";
