"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" className="h-12 gap-2 px-5 text-base print:hidden sm:h-10 sm:text-sm" onClick={() => window.print()}>
      <PrinterIcon className="size-4" />
      {label}
    </Button>
  );
}
