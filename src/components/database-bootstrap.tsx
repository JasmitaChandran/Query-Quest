"use client";

import * as React from "react";

import { useDatabaseStore } from "@/store/database-store";

export function DatabaseBootstrap() {
  const initialize = useDatabaseStore((state) => state.initialize);

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  return null;
}
