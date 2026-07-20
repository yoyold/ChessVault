import {
  BarChart3,
  Cpu,
  Flag,
  GitBranch,
  LayoutDashboard,
  Library,
  NotebookPen,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;

  /**
   * Whether the module behind this entry exists yet.
   *
   * Unbuilt modules are listed but not linked. Linking them would mean shipping
   * empty pages, and hiding them entirely would leave no indication of what the
   * application is going to be. A visibly inactive entry states the position
   * honestly and costs nothing to flip once the module lands.
   */
  available: boolean;
}

/**
 * The application's primary navigation.
 *
 * Ordered to follow the workflow rather than the build order: material comes in
 * (games), gets examined (analysis), turns into structured knowledge (openings,
 * endgames, tactics, notes), and is then reviewed (statistics).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, available: true },
  { href: "/games", label: "Games", icon: Library, available: false },
  { href: "/analysis", label: "Analysis", icon: Cpu, available: false },
  { href: "/openings", label: "Openings", icon: GitBranch, available: false },
  { href: "/endgames", label: "Endgames", icon: Flag, available: false },
  { href: "/tactics", label: "Tactics", icon: Target, available: false },
  { href: "/notes", label: "Notes", icon: NotebookPen, available: false },
  { href: "/statistics", label: "Statistics", icon: BarChart3, available: false },
  { href: "/settings", label: "Settings", icon: Settings, available: true },
];

/**
 * Whether a navigation entry is the active one for the current path.
 *
 * The root is matched exactly; every other entry also matches its sub-paths, so
 * a detail view keeps its section highlighted.
 */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
