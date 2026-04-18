"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@sparkflow/ui";

export function RegenerateButton({
  onRegenerate,
  disabled,
}: {
  onRegenerate: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onRegenerate}
      disabled={disabled}
      aria-label="Regenerate"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      <span className="sr-only">Regenerate</span>
    </Button>
  );
}
