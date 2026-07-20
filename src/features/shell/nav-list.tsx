"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./navigation";

const ITEM_BASE =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";

/**
 * The primary navigation, shared by the desktop sidebar and the mobile drawer.
 *
 * Entries for modules that do not exist yet render as inert text rather than
 * links: a link to an empty page is a dead end, while a visibly inactive entry
 * communicates what is coming. They are marked `aria-disabled` and kept out of
 * the tab order so keyboard and screen reader users are not offered a target
 * that does nothing.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;

        if (!item.available) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className={cn(ITEM_BASE, "text-muted-foreground/50 cursor-default")}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              <span className="text-[10px] uppercase tracking-wide">Soon</span>
            </span>
          );
        }

        const active = isActivePath(item.href, pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              ITEM_BASE,
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
