import Image from "next/image";
import logo from "../../public/brand/tracepay-logo.png";
import { cn } from "@/lib/utils";

/** The TRACE Pay wordmark with its check mark. Height sets the size; width follows the artwork (714×160). */
export function Logo({ height = 24, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src={logo}
      alt="TRACE Pay"
      height={height}
      style={{ width: "auto", height }}
      priority={priority}
      className={cn("select-none", className)}
    />
  );
}
