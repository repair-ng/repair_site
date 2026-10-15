"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn, btn2, Card, Err, Field, input, Shell, useMe } from "@/components/ui";

export default function Bookings() {
  const { me } = useMe();
  const [list, setList] = useState<any[]>([]);
  const [biz, setBiz] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api("/api/bookings").then((d) => setList(d.bookings));
  useEffect(() => { load(); api("/api/businesses").then((d) => setBiz(d.businesses)).catch(() => {}); }, []);
  const run = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <Shell me={me} title="Bookings">
      <Err msg={err} />
      {me?.customerKind === "company" && (
        <Card><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api("/api/bookings", { body: { businessId: f.get("businessId"), title: f.get("title"), description: f.get("description"), frequency: f.get("frequency"), startDate: f.get("startDate"), endDate: f.get("endDate") || undefined } })); }}>
          <b>New recurring booking</b>
          <Field label="Worker company"><select name="businessId" className={input} required>{biz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Title"><input name="title" className={input} required maxLength={120} /></Field>
          <Field label="Requirements"><textarea name="description" className={input} required maxLength={2000} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Repeats"><select name="frequency" className={input}>{["daily", "weekly", "monthly", "yearly"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Starts"><input name="startDate" type="date" className={input} required /></Field>
            <Field label="Ends (optional)"><input name="endDate" type="date" className={input} /></Field></div>
          <button className={btn}>Request booking</button></form></Card>)}
      {list.map((b) => (
        <Card key={b.id}><div className="flex justify-between"><b>{b.title}</b><span className="text-xs">{b.status}</span></div>
          <div className="text-xs text-ink/60">{b.customerName} → {b.businessName} · {b.frequency} from {b.startDate}{b.nextDate && ` · next: ${b.nextDate}`}</div>
          <p className="mt-2 text-sm">{b.description}</p>
          <div className="mt-2 flex gap-2">
            {b.side === "business" && b.status === "pending" && (<><button className={btn} onClick={() => run(() => api(`/api/bookings/${b.id}/respond`, { body: { accept: true } }))}>Accept</button><button className={btn2} onClick={() => run(() => api(`/api/bookings/${b.id}/respond`, { body: { accept: false } }))}>Deny</button></>)}
            {b.side === "customer" && ["pending", "accepted"].includes(b.status) && <button className={btn2} onClick={() => run(() => api(`/api/bookings/${b.id}/cancel`, { body: {} }))}>Cancel</button>}</div></Card>))}
    </Shell>
  );
}
