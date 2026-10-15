"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client";
import { LOCATIONS, SERVICES } from "@/lib/config";
import { btn, Card, input, Shell, useMe } from "@/components/ui";

// Worker job board: first come, first served. Polls every 6 s.
export default function Board() {
  const { me } = useMe();
  const [jobs, setJobs] = useState<any[]>([]);
  const [f, setF] = useState({ q: "", serviceId: "", areaId: "", express: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api(`/api/jobs${qs(f)}`).then((d) => setJobs(d.jobs)).catch(() => {}), [f]);
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  async function claim(id: string) {
    try {
      const r = await api(`/api/jobs/${id}/claim`, { body: me?.membership?.planActive ? { businessId: me.membership.businessId } : {} });
      setMsg(`Claimed! Contact ${r.customer.name} on ${r.customer.phone} within ${r.engageWithinMinutes} minutes, then tap “I've engaged” in My jobs.`);
      load();
    } catch (e: any) { setMsg(e.message); load(); }
  }
  return (
    <Shell me={me} title="Job board">
      <Card className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className={`${input} col-span-2`} placeholder="Search: phone fixing, roofing…" maxLength={60} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className={input} value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}><option value="">All services</option>{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className={input} value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })}><option value="">All areas</option>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className={input} value={f.express} onChange={(e) => setF({ ...f, express: e.target.value })}><option value="">Any type</option><option value="true">Express only</option><option value="false">Standard</option></select>
      </Card>
      {msg && <div className="mb-4 rounded-ticket bg-teal/20 p-3 text-sm text-white">{msg}</div>}
      <div className="job-ticket overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink/50"><tr><th className="p-3">Job</th><th>Area</th><th>Posted</th><th /></tr></thead>
          <tbody>{jobs.length === 0 && <tr><td className="p-4 text-ink/50" colSpan={4}>No open jobs match.</td></tr>}
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-line align-top">
                <td className="p-3"><b>{j.title}</b> {j.isExpress && <span className="rounded-full bg-signal/15 px-2 text-[11px] text-signal">EXPRESS</span>}
                  {j.sameArea && <span className="ml-1 rounded-full bg-teal/15 px-2 text-[11px] text-teal">near you</span>}
                  <div className="text-xs text-ink/60">{j.description.slice(0, 140)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{j.keywords.slice(0, 4).map((k: string) => <span key={k} className="rounded bg-ink/5 px-1.5 text-[11px]">{k}</span>)}</div>
                  {j.isExpress && <div className="text-xs">⏱ {j.timeline}</div>}</td>
                <td className="p-3 text-xs">{LOCATIONS.find((l) => l.id === j.areaId)?.name}{j.distanceKm !== null && ` · ${j.distanceKm} km`}</td>
                <td className="p-3 text-xs">{new Date(j.postedAt).toLocaleTimeString()}</td>
                <td className="p-3"><button className={btn} onClick={() => claim(j.id)}>Take job</button></td>
              </tr>))}</tbody>
        </table>
      </div>
    </Shell>
  );
}
