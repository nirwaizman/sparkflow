/**
 * Ambient fallback module declarations for optional email dependencies.
 * These let the package typecheck before `pnpm install` has been run.
 * When the real packages are installed, their shipped types take
 * precedence (this file is a catch-all only).
 */
declare module "@react-email/components" {
  import type { ReactNode, CSSProperties } from "react";
  type Base = {
    children?: ReactNode;
    style?: CSSProperties;
    className?: string;
  };
  export const Html: (props: Base & { lang?: string; dir?: string }) => import("react").ReactElement;
  export const Head: (props: Base) => import("react").ReactElement;
  export const Preview: (props: Base) => import("react").ReactElement;
  export const Body: (props: Base) => import("react").ReactElement;
  export const Container: (props: Base) => import("react").ReactElement;
  export const Section: (props: Base) => import("react").ReactElement;
  export const Row: (props: Base) => import("react").ReactElement;
  export const Column: (props: Base) => import("react").ReactElement;
  export const Heading: (
    props: Base & { as?: string; level?: number },
  ) => import("react").ReactElement;
  export const Text: (props: Base) => import("react").ReactElement;
  export const Link: (props: Base & { href: string }) => import("react").ReactElement;
  export const Button: (props: Base & { href: string }) => import("react").ReactElement;
  export const Hr: (props: Base) => import("react").ReactElement;
  export const Img: (
    props: Base & { src: string; alt?: string; width?: number | string; height?: number | string },
  ) => import("react").ReactElement;
  export const Tailwind: (props: Base & { config?: unknown }) => import("react").ReactElement;
}

declare module "@react-email/render" {
  import type { ReactElement } from "react";
  export function render(
    element: ReactElement,
    options?: { pretty?: boolean; plainText?: boolean },
  ): string | Promise<string>;
}

declare module "resend" {
  export class Resend {
    constructor(apiKey: string);
    emails: {
      send: (input: {
        from: string;
        to: string | string[];
        subject: string;
        html?: string;
        text?: string;
        reply_to?: string | string[];
      }) => Promise<{
        data?: { id?: string } | null;
        error?: { message?: string } | null;
      }>;
    };
  }
}

declare module "@sparkflow/observability" {
  export function trackEvent(
    event: string,
    properties?: Record<string, unknown>,
    distinctId?: string,
  ): void;
}
