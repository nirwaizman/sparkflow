"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-[hsl(var(--input))]",
          "bg-[hsl(var(--bg))] px-3 py-2 text-sm text-[hsl(var(--fg))]",
          "placeholder:text-[hsl(var(--muted-foreground))]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--bg))]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "text-start",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
