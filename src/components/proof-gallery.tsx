import { FileTextIcon } from "lucide-react";
import type { ProofItem } from "@/db/schema";
import type { strings } from "@/lib/i18n";
import { PROOF_SPECS, specFor } from "@/lib/proof";
import { fmtTimeEAT } from "@/lib/time";
import { LocalTime } from "./local-time";

type S = (typeof strings)["en"]["proof"];

/**
 * Proof of dispatch, grouped so nobody can say independent and exporter records were blurred.
 * `fileUrl` points at an access-checked route (exporter session or buyer token).
 */
export function ProofGallery({
  items,
  s,
  fileUrl,
  time,
}: {
  items: ProofItem[];
  s: S;
  fileUrl: (itemId: string) => string;
  time: "eat" | "local";
}) {
  const recorded = items.filter((i) => i.sha256 && i.receivedAt);
  const order = (i: ProofItem) => PROOF_SPECS.findIndex((p) => p.type === i.type);
  const groups = [
    { key: "independent", title: s.independent, items: recorded.filter((i) => i.source === "independent") },
    { key: "exporter", title: s.recordedByExporter, items: recorded.filter((i) => i.source === "exporter") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2 text-sm font-medium">
            {g.key === "independent" ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">{g.title}</span>
            ) : (
              g.title
            )}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[...g.items].sort((a, b) => order(a) - order(b)).map((item) => {
              const unit = specFor(item.type)?.reading?.unit ?? "";
              return (
                <li key={item.id} className="overflow-hidden rounded-xl border">
                  <a href={fileUrl(item.id)} target="_blank" rel="noopener" className="block transition-opacity hover:opacity-90">
                    {item.contentType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private, access-checked file route
                      <img src={fileUrl(item.id)} alt={s.items[item.type].label} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />
                    ) : (
                      <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                        <FileTextIcon className="size-8" />
                        <span className="text-xs uppercase">{item.contentType.split("/")[1]}</span>
                      </span>
                    )}
                  </a>
                  <div className="p-2.5 text-xs">
                    <p className="text-sm font-medium leading-snug">{s.items[item.type].label}</p>
                    {item.value && (
                      <p className="font-medium">
                        {s.reading}: {item.value}
                        {unit}
                      </p>
                    )}
                    {item.issuer && <p className="text-muted-foreground">{item.issuer}</p>}
                    <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                      {s.verified} {time === "eat" ? fmtTimeEAT(item.receivedAt!) : <LocalTime iso={item.receivedAt!.toISOString()} />}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
