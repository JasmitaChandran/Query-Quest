"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "next-themes";

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-border !bg-card !text-[13px] !text-card-foreground !shadow-2xl",
          title: "!font-semibold",
          description: "!text-[12px] !leading-5 !text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
