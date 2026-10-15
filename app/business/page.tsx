"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { LOCATIONS } from "@/lib/config";
import { btn, btn2, Card, Err, Field, input, Shell, Stars, useMe } from "@/components/ui";

const naira = (k: number) => `₦${(k / 100).toLocaleString()}`;
export default function Business() {
  const { me } = useMe();
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pts, setPts] = useState<any>(null);
  const [q, setQ] = useState(""); const [err, setErr] = useState<string | null>(null);
  const load = () => api("/api/business").then(async (d) => {
    setData(d);
    if (d.business?.myRole === "admin") { api(`/api/business/members?q=${encodeURIComponent(q)}`).then((m) => setMembers(m.members)); api("/api/business/points").then(setPts); }
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);
  const run = async (fn: () => Promise<any>) => { setErr(null); try { const r = await fn(); if (r?.authorizationUrl) { location.href = r.authorizationUrl; return; } load(); } catch (e: any) { setErr(e.message); } };
  if (me && me.role !== "worker") return <Shell me={me} title="Company"><Card>Companies are registered by worker accounts.</Card></Shell>;
  const b = data?.business;
  return (
    <Shell me={me} title="Company">
      <Err msg={err} />
      {data && !b && (
        <Card>
          <p className="mb-2 text-sm">To register a business you need <b>{data.eligibility.requirement}</b> (you have {data.eligibility.completedJobs} jobs{data.eligibility.lifetimeAverage ? `, avg ${data.eligibility.lifetimeAverage.toFixed(2)}` : ""}) — or pay {naira(data.eligibility.skipFeeKobo)} to skip.</p>
          {!data.eligibility.meets && <button className={btn2} onClick={() => run(() => api("/api/payments/initiate", { body: { kind: "business_skip_fee" } }))}>Pay {naira(data.eligibility.skipFeeKobo)} to skip</button>}
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api("/api/business", { body: { name: f.get("name"), areaId: f.get("areaId"), headcount: Number(f.get("headcount")), description: f.get("description") || undefined } })); }}>
            <Field label="Company name"><input name="name" className={input} required maxLength={120} /></Field>
            <Field label="Area"><select name="areaId" className={input}>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="How many people work with you? (sets your monthly plan: ₦500 for ≤5 up to ₦3,500 for 45+)"><input name="headcount" type="number" min={1} className={input} required /></Field>
            <Field label="Description (optional)"><textarea name="description" className={input} maxLength={1000} /></Field>
            <button className={btn}>Register business</button>
          </form>
        </Card>)}
      {b && (<>
        <Card>
          <div className="text-lg font-semibold">{b.name} <span className="text-xs font-normal text-ink/50">({b.status.replace("_", " ")})</span></div>
          <div className="text-sm text-ink/70">Workers {b.members}/{b.declaredHeadcount} · plan {naira(b.monthlyFeeKobo)}/month{b.planPaidUntil && ` · paid until ${new Date(b.planPaidUntil).toLocaleDateString()}`} · <Stars r={b.stats.rating} /></div>
          {b.isOwner && (<div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} onClick={() => run(() => api("/api/payments/initiate", { body: { kind: "business_plan" } }))}>Pay monthly plan</button>
            <button className={btn2} onClick={() => { const n = Number(prompt("New number of people working with you?")); if (n) run(() => api("/api/business/headcount", { method: "PATCH", body: { headcount: n } })); }}>Change headcount</button></div>)}
          {!b.isOwner && <button className={`${btn2} mt-3`} onClick={() => confirm("Leave this company?") && run(() => api("/api/business/leave", { body: {} }))}>Leave company</button>}
        </Card>
        {b.myRole === "admin" && (<>
          {pts && <Card>Points available: <b>{pts.balance}</b>{pts.nextExpiry && <span className="text-xs text-ink/50"> (next expiry {new Date(pts.nextExpiry).toLocaleString()})</span>}</Card>}
          <Card>
            <input className={`${input} mb-3`} placeholder="Search your workers by name" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-sm">
                <span className="flex-1"><b>{m.fullName}</b> <span className="text-xs text-ink/50">{m.role} · <Stars r={m.rating} /> · {m.completedJobs} jobs</span></span>
                <button className={btn2} onClick={() => { const n = Number(prompt("Points to award")); if (n) run(() => api("/api/business/points", { body: { workerId: m.id, points: n } })); }}>Award points</button>
                {b.isOwner && m.id !== me.id && <button className={btn2} onClick={() => run(() => api(`/api/business/members/${m.id}`, { method: "PATCH", body: { role: m.role === "admin" ? "member" : "admin" } }))}>{m.role === "admin" ? "Make member" : "Make admin"}</button>}
                {m.id !== me.id && <button className={btn2} onClick={() => confirm(`Remove ${m.fullName}? They will be notified.`) && run(() => api(`/api/business/members/${m.id}`, { method: "DELETE" }))}>Remove</button>}
              </div>))}
            <p className="mt-3 text-xs text-ink/50">To add people, find them in the Workers tab and choose “Register under my company”.</p>
          </Card></>)}
      </>)}
    </Shell>
  );
}
