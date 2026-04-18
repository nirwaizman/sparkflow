"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "rounded-md bg-[hsl(var(--muted))]",
        // Use the keyframe defined in globals.css; falls back to tailwind pulse.
        "animate-pulse [animation:sparkflow-pulse_1.8s_cubic-bezier(0.4,0,0.6,1)_infinite]",
        className,
      )}
      {...props}
    />
  );
}
Skeleton.displayName = "Skeleton";
