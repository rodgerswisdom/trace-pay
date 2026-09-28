"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { primaryButton } from "@/components/bottom-bar";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={cn(primaryButton, className)}>
      {pending ? "One moment…" : children}
    </Button>
  );
}
