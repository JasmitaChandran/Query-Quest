import type { Metadata } from "next";

import { DatabaseBootstrap } from "@/components/database-bootstrap";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QueryQuest — Learn SQL visually",
    template: "%s — QueryQuest",
  },
  description:
    "An interactive SQL teaching and visualization workspace built to make every query easier to understand.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <DatabaseBootstrap />
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
