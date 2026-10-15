"use client";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/client";
import { LOCATIONS, SERVICES } from "@/lib/config";
import { btn, Card, input, Shell, Stars, useMe } from "@/components/ui";

// The "RE-PAIR workers" tab. Company admins can invite unaffiliated workers from here.
export default function Workers() {
  const { me } = useMe();
  const [f, setF] = useState({ q: "", areaId: "", serviceId: "" });
  const [list, setList] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => api(`/api/workers${qs(f)}`).then((d) => setList(d.workers)).catch(() => {}), 250); return () => clearTimeout(t); }, [f]);
  const canInvite = me?.role === "worker" && me?.membership?.role === "admin";
  async function invite(id: string) { try { await api("/api/business/invitations", { body: { workerId: id } }); setMsg("Invitation sent — they'll be notified."); } catch (e: any) { setMsg(e.message); } }
  return (
    <Shell me={me} title="Workers">
      <Card className="grid grid-cols-3 gap-2">
        <input className={input} placeholder="Search by name" maxLength={60} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className={input} value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })}><option value="">Any area</option>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className={input} value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}><option value="">Any service</option>{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </Card>
      {msg && <div className="mb-3 rounded-ticket bg-teal/20 p-3 text-sm text-white">{msg}</div>}
      {list.map((w) => (
        <Card key={w.id}><div className="flex items-center gap-3">
          {w.avatarUrl ? <img src={w.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="h-12 w-12 rounded-full bg-ink/10" />}
          <div className="flex-1 text-sm"><b>{w.fullName}</b> <span className="text-ink/60">· {LOCATIONS.find((l) => l.id === w.areaId)?.name}</span>
            <div className="text-xs text-ink/60"><Stars r={w.rating} /> · {w.completedJobs} jobs{w.companyName ? ` · ${w.companyName}` : ""}</div></div>
          {canInvite && !w.companyName && <button className={btn} onClick={() => invite(w.id)}>Register under my company</button>}
        </div></Card>))}
    </Shell>
  );
}
