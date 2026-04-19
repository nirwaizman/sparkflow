"use client";

/**
 * Button group for switching the preview container width between
 * canonical device sizes. The chosen width is owned by the parent and
 * forwarded to `<PreviewIframe />`.
 */
import { Button } from "@sparkflow/ui";

export type Device = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTHS: Record<Device, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

const DEVICES: { id: Device; label: string; px: number }[] = [
  { id: "desktop", label: "Desktop", px: DEVICE_WIDTHS.desktop },
  { id: "tablet", label: "Tablet", px: DEVICE_WIDTHS.tablet },
  { id: "mobile", label: "Mobile", px: DEVICE_WIDTHS.mobile },
];

type Props = {
  value: Device;
  onChange: (d: Device) => void;
  size?: "sm" | "md";
};

export function DeviceTabs({ value, onChange, size = "sm" }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Preview device size"
      className="inline-flex items-center gap-1 rounded-md border p-0.5 bg-white/5"
    >
      {DEVICES.map((d) => {
        const active = d.id === value;
        return (
          <Button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={active}
            size={size === "sm" ? "sm" : "md"}
            variant={active ? "default" : "ghost"}
            onClick={() => onChange(d.id)}
            className="h-7 px-2 text-xs"
            title={`${d.label} · ${d.px}px`}
          >
            {d.label}
          </Button>
        );
      })}
    </div>
  );
}
