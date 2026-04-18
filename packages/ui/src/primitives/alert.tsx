"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const alertVariants = cva(
  [
    "relative w-full rounded-lg border p-4",
    // Icon slot: position an optional leading icon to the start, push text over.
    "[&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4 [&>svg]:h-4 [&>svg]:w-4",
    "[&>svg~*]:ps-7 [&>svg+div]:translate-y-[-3px]",
    "text-start",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--bg))] border-[hsl(var(--border))] text-[hsl(var(--fg))]",
        destructive:
          "border-[hsl(var(--danger))]/50 text-[hsl(var(--danger))] [&>svg]:text-[hsl(var(--danger))] bg-[hsl(var(--danger))]/5",
        success:
          "border-[hsl(var(--success))]/50 text-[hsl(var(--success))] [&>svg]:text-[hsl(var(--success))] bg-[hsl(var(--success))]/5",
        warning:
          "border-[hsl(var(--warning))]/50 text-[hsl(var(--warning))] [&>svg]:text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { alertVariants };
