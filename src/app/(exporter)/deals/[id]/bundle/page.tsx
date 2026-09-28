import Link from "next/link";
import { notFound } from "next/navigation";
import { requireExporter } from "@/auth";
import { PrintButton } from "@/components/print-button";
import { AdjustmentCheck } from "@/components/quality";
import { TransitChart } from "@/components/transit-chart";
import { claimCheckFor } from "@/lib/claim-check";
import { downsample } from "@/lib/transit";
import { amountsDue, loadDeal } from "@/lib/deals";
import { strings } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { PROOF_SPECS, specFor } from "@/lib/proof";
import { fmtTimeEAT } from "@/lib/time";

// E7: one printable page, saved as PDF from the browser. English, since it's shared with buyers,
// insurers or arbitrators. Times in UTC and East Africa Time.

const s = strings.en;
const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
const both = (d: Date) => `${utc(d)} (${fmtTimeEAT(d)} EAT)`;
const ACTOR = { exporter: "Exporter", buyer: "Buyer", payaza: "Payaza", system: "TRACE Pay" } as const;
const CLAIM_OUTCOME = {
  open: "Open",
  accepted: "Accepted in full",
  countered: "Settled at a different amount",
  rejected: "Kept as agreed, based on the dispatch records",
  withdrawn: "Withdrawn by the buyer",
} as const;

export default async function EvidenceBundlePage({ params }: PageProps<"/deals/[id]/bundle">) {
  const { id } = await params;
  const exporter = await requireExporter();
  const data = await loadDeal({ id, exporterId: exporter.id });
  if (!data) notFound();
  const { deal, payments, events, claims, proof, readings, transitLog } = data;
  const c = deal.currency;
  const due = amountsDue(deal, claims);
  const recorded = proof
    .filter((p) => p.sha256 && p.receivedAt)
    .sort((a, b) => (a.source === b.source ? 0 : a.source === "independent" ? -1 : 1) || PROOF_SPECS.findIndex((x) => x.type === a.type) - PROOF_SPECS.findIndex((x) => x.type === b.type));
  const confirmed = payments.filter((p) => p.status !== "pending");
  const generated = new Date();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 text-sm print:max-w-none print:gap-4 print:text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/deals/${id}`} className="-ml-1 flex h-11 items-center px-1 text-muted-foreground hover:text-foreground">
          ← {deal.number}
        </Link>
        <PrintButton label="Save as PDF / Print" />
      </div>

      <header className="border-b pb-4">
        <h1 className="text-2xl font-semibold">
          TRACE Pay evidence bundle · {deal.number} · generated {utc(generated)}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {deal.exporter.businessName} → {deal.buyerCompany}. Status: {s.status[deal.status]}.
        </p>
      </header>

      <Section title="1. Deal and terms">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          <Item k="Exporter" v={`${deal.exporter.businessName} · ${deal.exporter.contactName} · ${deal.exporter.email}`} />
          <Item k="Buyer" v={`${deal.buyerCompany} · ${deal.buyerContact} · ${deal.buyerEmail}${deal.buyerPhone ? ` · ${deal.buyerPhone}` : ""}`} />
          <Item k="Product" v={`${deal.product} avocados · ${deal.weightKg.toLocaleString("en-US")} kg`} />
          <Item k="Destination" v={`${deal.destination} · expected dispatch ${deal.dispatchDate}`} />
          <Item k="Price" v={`${fmt(deal.pricePerKgMinor, c)} per kg · total ${fmt(deal.totalMinor, c)}`} />
          <Item k="Deposit" v={`${deal.depositPct}% · ${fmt(due.deposit, c)}`} />
          <Item k="Balance" v={`${fmt(due.balance, c)}${due.balanceReduction ? ` (after ${fmt(due.balanceReduction, c)} agreed claim reduction)` : ""}`} />
          {deal.finalPct > 0 && (
            <Item k="Final" v={`${deal.finalPct}% on arrival · ${fmt(due.final, c)}${due.finalReduction ? ` (after ${fmt(due.finalReduction, c)} agreed claim reduction)` : ""}`} />
          )}
          <Item
            k="Quality terms"
            v={
              deal.minDryMatterPct != null
                ? `Dry matter ≥ ${deal.minDryMatterPct}% · transit ${deal.tempMinC}–${deal.tempMaxC} °C · ${deal.breachAdjustPct ?? 0}% of deal value off per breached term`
                : "None agreed"
            }
          />
          <Item k="Arrival" v={deal.arrivedAt ? both(deal.arrivedAt) : "Not confirmed"} />
          <Item k="Deal created" v={both(deal.createdAt)} />
          <Item k="Proof locked" v={deal.proofLockedAt ? both(deal.proofLockedAt) : "Not yet attached"} />
        </dl>
      </Section>

      <Section title="2. Proof of dispatch">
        {recorded.length === 0 ? (
          <p className="text-muted-foreground">No proof attached.</p>
        ) : (
          <>
            <p className="mb-3 text-muted-foreground">
              Each file was fingerprinted (SHA-256) by the TRACE Pay server from the bytes it received, at the time shown. Anyone holding the
              original file can recompute the fingerprint (e.g. <code className="font-mono">shasum -a 256 file</code>) and confirm it&apos;s unchanged.
              Files can&apos;t be added, changed or removed after proof is locked.
            </p>
            <ol className="flex flex-col gap-3">
              {recorded.map((p, i) => {
                const unit = specFor(p.type)?.reading?.unit ?? "";
                return (
                  <li key={p.id} className="flex gap-3 break-inside-avoid rounded-lg border p-3">
                    {p.contentType.startsWith("image/") && (
                      // eslint-disable-next-line @next/next/no-img-element -- private, access-checked file route
                      <img src={`/deals/${id}/files/${p.id}`} alt="" className="size-20 shrink-0 rounded border object-cover print:size-16" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {i + 1}. {s.proof.items[p.type].label}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {p.source === "independent" ? `Independent${p.issuer ? ` (${p.issuer})` : ""}` : "Recorded by exporter"}
                        </span>
                      </p>
                      {p.value && (
                        <p>
                          Reading: {p.value}
                          {unit}
                        </p>
                      )}
                      <p>
                        File: {p.fileName} · {p.contentType} · {(p.sizeBytes ?? 0).toLocaleString("en-US")} bytes
                      </p>
                      <p>Recorded: {both(p.receivedAt!)}</p>
                      <p className="font-mono text-xs break-all">SHA-256 {p.sha256}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Section>

      <Section title="3. Readings and transit">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-xs text-muted-foreground uppercase">
              <th className="py-2 pr-3">Stage</th>
              <th className="py-2 pr-3">Dry matter</th>
              <th className="py-2 pr-3">Pulp</th>
              <th className="py-2 pr-3">Net weight</th>
              <th className="py-2 pr-3">Sample · by</th>
              <th className="py-2 pr-3">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {(["origin", "arrival"] as const).map((stage) => {
              const r = readings.find((x) => x.stage === stage);
              const by = !r ? "" : stage === "origin" ? "Recorded by exporter" : r.measuredBy === "inspector" ? "Independent" : "Recorded by buyer";
              return (
                <tr key={stage} className="border-b align-top">
                  <td className="py-2 pr-3">{stage === "origin" ? "At dispatch" : "At arrival"}</td>
                  <td className="py-2 pr-3">{r?.dryMatterPct != null ? `${r.dryMatterPct.toFixed(1)}%` : "—"}</td>
                  <td className="py-2 pr-3">{r?.pulpTempC != null ? `${r.pulpTempC.toFixed(1)} °C` : "—"}</td>
                  <td className="py-2 pr-3">{r?.netWeightKg != null ? `${r.netWeightKg.toLocaleString("en-US")} kg` : "—"}</td>
                  <td className="py-2 pr-3">{r ? `${r.sampleSize} · ${by} · ${r.device}` : "—"}</td>
                  <td className="py-2 pr-3">{r ? both(r.recordedAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transitLog ? (
          <div className="mt-3 flex flex-col gap-1">
            <p>
              Transit log{transitLog.isSample ? " (SAMPLE feed, demo data)" : ""}: {transitLog.count} readings, {utc(transitLog.startAt)} to {utc(transitLog.endAt)} ·{" "}
              {transitLog.minC.toFixed(1)}–{transitLog.maxC.toFixed(1)} °C{transitLog.device ? ` · ${transitLog.device}` : ""}
            </p>
            <p>
              File: {transitLog.fileName} · recorded {both(transitLog.receivedAt)}
            </p>
            <p className="font-mono text-xs break-all">SHA-256 {transitLog.sha256}</p>
            <div className="mt-2 break-inside-avoid">
              <TransitChart points={downsample(transitLog.points)} min={deal.tempMinC} max={deal.tempMaxC} timeZone="UTC" />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground">No transit log attached.</p>
        )}
      </Section>

      <Section title="4. Payments (via Payaza)">
        {confirmed.length === 0 ? (
          <p className="text-muted-foreground">No confirmed payments.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">KES (rate)</th>
                  <th className="py-2 pr-3">Paid</th>
                  <th className="py-2 pr-3">References</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((p) => (
                  <tr key={p.id} className="border-b align-top">
                    <td className="py-2 pr-3 capitalize">{p.kind}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmt(p.amountMinor, p.currency)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.kesAmountMinor != null ? fmt(p.kesAmountMinor, "KES") : "—"} ({p.fxRate ?? "—"})
                    </td>
                    <td className="py-2 pr-3">{p.paidAt ? both(p.paidAt) : "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs break-all">
                      Payaza {p.payazaReference}
                      <br />
                      Ours {p.merchantReference}
                      {p.settlementReference && (
                        <>
                          <br />
                          Settlement {p.settlementReference}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="5. Quality adjustment, check and response">
        {claims.length === 0 ? (
          <p className="text-muted-foreground">No adjustment was requested.</p>
        ) : (
          claims.map((cl) => {
            const files = cl.evidence.length ? cl.evidence : cl.photoKeys.map((key) => ({ key, contentType: "image/jpeg", requirement: "", fileName: "", receivedAt: "" }));
            return (
            <div key={cl.id} className="flex flex-col gap-1.5">
              <p>
                <span className="font-semibold">{s.claimsList.reason[cl.reason]}</span> · requested {both(cl.createdAt)} ·{" "}
                {fmt(cl.amountRequestedMinor, c)} per the agreed terms ·{" "}
                {cl.measuredBy === "inspector" ? "Independent" : "Recorded by buyer"}
              </p>
              <p className="border-l-2 pl-3">{cl.description}</p>
              <p>
                Buyer evidence: {files.length} file{files.length === 1 ? "" : "s"}
                {files.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-2">
                    {files.map((f, n) =>
                      f.contentType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private, access-checked route
                        <img key={f.key} src={`/deals/${id}/claims/${cl.id}/${n}`} alt="" className="size-16 rounded border object-cover" />
                      ) : (
                        <span key={f.key} className="flex size-16 items-center justify-center rounded border text-xs text-muted-foreground">
                          PDF
                        </span>
                      ),
                    )}
                  </span>
                )}
              </p>
              <div className="my-2 break-inside-avoid">
                <AdjustmentCheck check={claimCheckFor({ deal, claim: cl, readings, transitLog })} s={s.deal} currency={c} />
              </div>
              <p>
                Outcome: <span className="font-semibold">{CLAIM_OUTCOME[cl.status]}</span>
                {cl.status !== "open" && ` · ${fmt(cl.agreedAmountMinor ?? 0, c)} taken off`}
                {cl.respondedAt && ` · answered ${both(cl.respondedAt)}`}
              </p>
              {cl.responseNote && <p className="border-l-2 pl-3">Exporter: &ldquo;{cl.responseNote}&rdquo;</p>}
            </div>
            );
          })
        )}
      </Section>

      <Section title="6. Timeline">
        <p className="mb-2 text-muted-foreground">Append-only: events can&apos;t be edited or deleted.</p>
        <ol className="flex flex-col gap-1">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[11rem_5.5rem_1fr] gap-2 break-inside-avoid print:grid-cols-[9.5rem_4.5rem_1fr]">
              <span className="font-mono text-xs">{utc(e.createdAt)}</span>
              <span className="text-muted-foreground">{ACTOR[e.actor]}</span>
              <span>{e.summary}</span>
            </li>
          ))}
        </ol>
      </Section>

      <footer className="border-t pt-3 text-xs text-muted-foreground">
        Generated by TRACE Pay for {deal.exporter.businessName} · {deal.number} · {utc(generated)}. Payment amounts and references come from Payaza
        confirmations. KES amounts use the rate stored on each payment.
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
