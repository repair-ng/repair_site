"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn, btn2, Card, Shell, Stars, useMe } from "@/components/ui";

export default function Dashboard() {
  const { me, loading } = useMe();
  const [inv, setInv] = useState<any[]>([]);
  useEffect(() => {
    if (me?.role === "worker") api("/api/invitations").then((d) => setInv(d.invitations)).catch(() => {});
  }, [me]);
  if (loading || !me) return <Shell title="Loading..."><span /></Shell>;
  const s = me.stats;
  const respond = async (id: string, accept: boolean) => {
    try { await api(`/api/invitations/${id}/respond`, { body: { accept } }); location.reload(); } catch (e: any) { alert(e.message); }
  };
  return (
    <Shell me={me} title={`Hello, ${me.fullName.split(" ")[0]}`}>
      <Card>
        <div className="flex items-center gap-4">
          {me.avatarUrl && <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />}
          <div className="text-sm"><div className="font-semibold">{me.companyName ?? me.fullName}</div><div className="text-ink/60">{me.email} · {me.phone}</div></div>
        </div>
        {me.role === "worker" ? (
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-2xl font-semibold">{s.completedJobs}</div><div className="text-xs text-ink/50">Completed jobs</div></div>
            <div><div className="text-2xl font-semibold"><Stars r={s.rating} /></div><div className="text-xs text-ink/50">{s.rated ? "Rating this year" : `Unrated until 10 jobs (${s.completedJobs}/10)`}</div></div>
            <div><div className="text-lg font-semibold">{me.membership?.name ?? "—"}</div><div className="text-xs text-ink/50">Company</div></div>
          </div>
        ) : (
          <div className="mt-4 text-sm">Customer points: <b>{me.points}</b>{me.postingDelayMinutes > 0 && <span className="text-danger"> — your jobs are delayed {me.postingDelayMinutes} min</span>}</div>
        )}
        {s?.history?.length > 0 && <div className="mt-4 text-xs text-ink/60">History: {s.history.map((h: any) => `${h.year}: ★${h.average.toFixed(2)} (${h.count})`).join(" · ")}</div>}
      </Card>
      {inv.map((i) => (
        <Card key={i.id}><div className="text-sm">🏢 <b>{i.businessName}</b> wants to register you as one of their workers.</div>
          <div className="mt-3 flex gap-2"><button className={btn} onClick={() => respond(i.id, true)}>Accept</button><button className={btn2} onClick={() => respond(i.id, false)}>Deny</button></div></Card>
      ))}
    </Shell>
  );
}
