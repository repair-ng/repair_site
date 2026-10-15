"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { LOCATIONS, SERVICES } from "@/lib/config";
import { btn, Card, Err, Field, input, Shell } from "@/components/ui";

type Kind = "worker" | "individual" | "company";
export default function Register() {
  const [kind, setKind] = useState<Kind>("worker");
  const [services, setServices] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const out = new FormData();
    out.set("role", kind === "worker" ? "worker" : "customer");
    if (kind !== "worker") out.set("customerKind", kind);
    for (const k of ["fullName", "companyName", "email", "phone", "password", "address", "areaId", "website"]) { const v = f.get(k); if (typeof v === "string" && v) out.set(k, v); }
    if (kind === "worker") { services.forEach((s) => out.append("services", s)); const a = f.get("avatar"); if (a instanceof File && a.size) out.set("avatar", a); }
    try { await api("/api/auth/register", { form: out }); window.location.href = "/dashboard"; }
    catch (x) { const a = x as ApiError; setErr(a.issues?.length ? a.issues.map((i) => `${i.path}: ${i.message}`).join(" · ") : a.message); }
    finally { setBusy(false); }
  }
  return (
    <Shell title="Create your account">
      <Card>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {([["worker", "Worker"], ["individual", "Customer (individual)"], ["company", "Customer (company)"]] as [Kind, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 ${kind === k ? "border-signal bg-signal text-white" : "border-line"}`}>{l}</button>
          ))}
        </div>
        <form onSubmit={submit}>
          {/* honeypot: hidden from humans, bots fill it */}
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Field label="Full name"><input name="fullName" className={input} required minLength={2} maxLength={100} /></Field>
          {kind === "company" && <Field label="Company name"><input name="companyName" className={input} required maxLength={120} /></Field>}
          <Field label="Email"><input name="email" type="email" className={input} required maxLength={254} autoComplete="email" /></Field>
          <Field label="Phone number"><input name="phone" type="tel" className={input} required placeholder="080X XXX XXXX" maxLength={25} /></Field>
          <Field label="Password (10+ characters, letters and numbers)"><input name="password" type="password" className={input} required minLength={10} maxLength={128} autoComplete="new-password" /></Field>
          <Field label="Area"><select name="areaId" className={input} required defaultValue="">
            <option value="" disabled>Choose your area</option>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Address"><input name="address" className={input} required minLength={5} maxLength={300} /></Field>
          {kind === "worker" && (<>
            <Field label="Profile picture (JPEG/PNG/WebP, max 2 MB) — required"><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm" /></Field>
            <p className="mb-1 text-xs font-medium text-ink/60">Services you offer</p>
            <div className="mb-4 flex flex-wrap gap-2">{SERVICES.map((s) => (
              <button key={s.id} type="button" onClick={() => setServices((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])}
                className={`rounded-full border px-3 py-1 text-xs ${services.includes(s.id) ? "border-teal bg-teal text-white" : "border-line"}`}>{s.name}</button>))}</div>
          </>)}
          <button className={btn} disabled={busy}>{busy ? "Creating..." : "Create account"}</button><Err msg={err} />
        </form>
      </Card>
    </Shell>
  );
}
