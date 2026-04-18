"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * `start` and `end` are logical sides — they map to left/right based on the
 * document direction. Radix doesn't know about `dir`, so we set the pane's
 * position with logical utilities (`start-0`, `end-0`) and use Tailwind
 * `rtl:`/`ltr:` variants to pick the correct slide animation.
 */
const sheetVariants = cva(
  [
    "fixed z-50 gap-4 bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] p-6 shadow-lg",
    "transition ease-in-out",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:duration-300 data-[state=open]:duration-500",
  ].join(" "),
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-[hsl(var(--border))] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-[hsl(var(--border))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        start: [
          "inset-y-0 start-0 h-full w-3/4 sm:max-w-sm",
          "border-e border-[hsl(var(--border))]",
          // LTR: slides from the left; RTL: slides from the right.
          "ltr:data-[state=closed]:slide-out-to-left ltr:data-[state=open]:slide-in-from-left",
          "rtl:data-[state=closed]:slide-out-to-right rtl:data-[state=open]:slide-in-from-right",
        ].join(" "),
        end: [
          "inset-y-0 end-0 h-full w-3/4 sm:max-w-sm",
          "border-s border-[hsl(var(--border))]",
          "ltr:data-[state=closed]:slide-out-to-right ltr:data-[state=open]:slide-in-from-right",
          "rtl:data-[state=closed]:slide-out-to-left rtl:data-[state=open]:slide-in-from-left",
        ].join(" "),
      },
    },
    defaultVariants: { side: "end" },
  },
);

export type SheetContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> &
  VariantProps<typeof sheetVariants>;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "end", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute end-4 top-4 rounded-sm opacity-70 transition-opacity",
          "hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
          "disabled:pointer-events-none",
        )}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-start", className)}
      {...props}
    />
  );
}
SheetHeader.displayName = "SheetHeader";

export function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-[hsl(var(--fg))]", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[hsl(var(--muted-foreground))]", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;
