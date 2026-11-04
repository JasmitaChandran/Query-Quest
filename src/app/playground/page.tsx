import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SqlWorkspace } from "@/components/playground/sql-workspace";

export const metadata: Metadata = {
  title: "SQL Playground",
  description: "A focused SQL learning workspace with database explorer, editor, and data panels.",
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader workspace />
      <SqlWorkspace />
    </div>
  );
}
