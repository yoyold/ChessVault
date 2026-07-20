import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/features/shell/app-shell";
import { ThemeProvider } from "@/features/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// The variable names must match those `globals.css` consumes: its `@theme`
// block maps `--font-sans` and `--font-geist-mono` onto Tailwind's font
// utilities, and a mismatch silently falls back to the browser default.
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ChessVault",
  description:
    "A personal chess database, analysis workbench and training log that runs entirely in the browser.",
};

export const viewport: Viewport = {
  // The board and the analysis panels are laid out for the visual viewport;
  // allowing zoom is an accessibility requirement and costs nothing here.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // next-themes sets the theme class on <html> from localStorage before
    // paint, which by definition differs from the statically exported markup.
    // Suppressing the warning on this element is the documented handling; it
    // does not extend to descendants.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
