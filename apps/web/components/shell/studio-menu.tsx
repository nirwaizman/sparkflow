"use client";

/**
 * Studio sub-menu — rendered from the sidebar's Studio entry.
 *
 * Exposes all 8 studio surfaces (slides, sheets, docs, image, video,
 * music, design, dev) under a single dropdown so the narrow icon rail
 * stays compact while still being a one-click jump to any studio tool.
 *
 * This component owns only the menu: the trigger (icon button with
 * tooltip) is provided by the sidebar so it can match the rail styling.
 */
import Link from "next/link";
import {
  Code,
  FileText,
  Image as ImageIcon,
  Music,
  Paintbrush,
  Presentation,
  Table,
  Video,
} from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@sparkflow/ui";

type StudioLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STUDIO_LINKS: StudioLink[] = [
  { href: "/slides", label: "Slides", icon: Presentation },
  { href: "/sheets", label: "Sheets", icon: Table },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/image", label: "Image", icon: ImageIcon },
  { href: "/video", label: "Video", icon: Video },
  { href: "/music", label: "Music", icon: Music },
  { href: "/design", label: "Design", icon: Paintbrush },
  { href: "/dev", label: "Dev", icon: Code },
];

/**
 * Content portion of the Studio dropdown. Render inside a
 * `<DropdownMenu>` together with a sidebar-styled `<DropdownMenuTrigger>`.
 */
export function StudioMenuContent() {
  return (
    <DropdownMenuContent side="left" sideOffset={8} className="min-w-[12rem]">
      <DropdownMenuLabel>Studio</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {STUDIO_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href}>
              <Icon className="h-4 w-4" />
              <span>{link.label}</span>
            </Link>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}

export { STUDIO_LINKS };
