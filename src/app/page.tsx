import type { Metadata } from "next";

import { SqlWorkspace } from "@/components/playground/sql-workspace";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "SQL Playground",
  description: "A browser-native SQL workspace with database tools, visualizations, and teaching mode.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />
      <SqlWorkspace />
    </div>
  );
}
