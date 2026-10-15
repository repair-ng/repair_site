"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { LOCATIONS, SERVICES } from "@/lib/config";
import { btn, Card, Err, Field, input, Shell, useMe } from "@/components/ui";

export default function NewJob() {
  const { me } = useMe();
  const [express, setExpress] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget); const g = (k: string) => (f.get(k) as string) || undefined;
    try {
      const r = await api("/api/jobs", { body: {
        title: g("title"), description: g("description"), serviceId: g("serviceId"), areaId: g("areaId"), address: g("address"),
        keywords: (g("keywords") ?? "").split(",").map((s) => s.trim()).filter(Boolean), express,
        timeline: express ? g("timeline") : undefined, requirements: express ? g("requirements") : undefined } });
      window.location.href = r.authorizationUrl ?? "/my-jobs";
    } catch (x: any) { setErr(x.issues?.map((i: any) => `${i.path}: ${i.message}`).join(" · ") || x.message); } finally { setBusy(false); }
  }
  return (
    <Shell me={me} title="Post a job">
      <Card><form onSubmit={submit}>
        <Field label="What needs fixing?"><input name="title" className={input} required minLength={3} maxLength={120} placeholder="e.g. Cracked iPhone screen" /></Field>
        <Field label="Details"><textarea name="description" className={input} required minLength={5} maxLength={2000} rows={4} /></Field>
        <Field label="Service"><select name="serviceId" className={input} required defaultValue="">{<option value="" disabled>Choose…</option>}{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Search tags (comma separated, optional)"><input name="keywords" className={input} placeholder="Replacement, Roofing" maxLength={200} /></Field>
        <Field label="Area"><select name="areaId" className={input} defaultValue={me?.areaId}>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Job address (change it if you're not at home/work)"><input key={me?.address} name="address" className={input} defaultValue={me?.address} minLength={5} maxLength={300} /></Field>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} /> Express order (₦1,000 — nearby top-rated workers are alerted first)</label>
        {express && (<><Field label="How soon do you need it?"><input name="timeline" className={input} required maxLength={200} placeholder="Within 2 hours" /></Field>
          <Field label="Specific requirements"><textarea name="requirements" className={input} required maxLength={1000} rows={3} /></Field></>)}
        <button className={btn} disabled={busy}>{busy ? "..." : `Pay ${express ? "₦1,000" : "₦100"} & post`}</button><Err msg={err} />
      </form></Card>
    </Shell>
  );
}
