/**
 * Ambient fallback declarations for optional @react-email / resend
 * packages. These let the web app typecheck before `pnpm install` has
 * been executed. When the real packages are installed, their bundled
 * types are more specific and take precedence.
 */
declare module "@react-email/components" {
  import type { ReactNode, CSSProperties, ReactElement } from "react";
  type Base = {
    children?: ReactNode;
    style?: CSSProperties;
    className?: string;
  };
  export const Html: (props: Base & { lang?: string; dir?: string }) => ReactElement;
  export const Head: (props: Base) => ReactElement;
  export const Preview: (props: Base) => ReactElement;
  export const Body: (props: Base) => ReactElement;
  export const Container: (props: Base) => ReactElement;
  export const Section: (props: Base) => ReactElement;
  export const Row: (props: Base) => ReactElement;
  export const Column: (props: Base) => ReactElement;
  export const Heading: (
    props: Base & { as?: string; level?: number },
  ) => ReactElement;
  export const Text: (props: Base) => ReactElement;
  export const Link: (props: Base & { href: string }) => ReactElement;
  export const Button: (props: Base & { href: string }) => ReactElement;
  export const Hr: (props: Base) => ReactElement;
  export const Img: (
    props: Base & {
      src: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
    },
  ) => ReactElement;
  export const Tailwind: (props: Base & { config?: unknown }) => ReactElement;
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
