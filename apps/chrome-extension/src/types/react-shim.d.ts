// TODO: delete this file after running `pnpm install` — @types/react and
// @types/react-dom will supply the real type definitions. This shim exists
// only so `tsc --noEmit` can pass in a fresh checkout before dependencies are
// installed. It covers just the React surface used by this extension.

declare module "react" {
  export type Key = string | number;
  export type ReactNode =
    | ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | ReactNode[];
  export interface ReactElement<P = unknown> {
    type: unknown;
    props: P;
    key: Key | null;
  }

  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);

  export function useState<S>(
    initial: S | (() => S)
  ): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useRef<T>(initial: T): { current: T };
  export function useCallback<T extends (...args: never[]) => unknown>(
    fn: T,
    deps: unknown[]
  ): T;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;

  export type FormEvent<T = Element> = { preventDefault(): void; currentTarget: T };
  export type ChangeEvent<T = Element> = { target: T & { value: string; checked?: boolean } };

  const React: unknown;
  export default React;
}

declare module "react-dom/client" {
  export interface Root {
    render(children: unknown): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elem: string]: Record<string, unknown>;
  }
  type Element = unknown;
}
