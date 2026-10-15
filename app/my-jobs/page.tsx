"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn, btn2, Card, Shell, useMe } from "@/components/ui";

export default function MyJobs() {
  const { me } = useMe();
  const [jobs, setJobs] = useState<any[]>([]);
  const load = () => api("/api/jobs/mine").then((d) => setJobs(d.jobs)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const act = async (path: string, body: unknown = {}) => { try { await api(path, { body }); } catch (e: any) { alert(e.message); } load(); };
  const ask = (m: string) => window.prompt(m)?.trim();
  return (
    <Shell me={me} title="My jobs">
      {jobs.length === 0 && <Card>Nothing here yet.</Card>}
      {jobs.map((j) => (
        <Card key={j.id}>
          <div className="flex items-start justify-between"><b>{j.title}</b><span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs">{j.status.replace("_", " ")}</span></div>
          <div className="mt-1 text-xs text-ink/60">{j.asWorker ? "You are the worker" : j.workerName ? `Worker: ${j.workerName}` : "Waiting for a worker"}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {j.asWorker && j.status === "claimed" && <button className={btn} onClick={() => act(`/api/jobs/${j.id}/engage`)}>I&apos;ve engaged the customer</button>}
            {!j.asWorker && ["claimed", "engaged"].includes(j.status) && (<>
              <button className={btn} onClick={() => act(`/api/jobs/${j.id}/decision`, { accept: true })}>Accept worker</button>
              <button className={btn2} onClick={() => { const r = ask("Why are you declining? (the worker will see this)"); if (r) act(`/api/jobs/${j.id}/decision`, { accept: false, reason: r }); }}>Decline</button></>)}
            {!j.asWorker && j.status === "in_progress" && <button className={btn} onClick={() => act(`/api/jobs/${j.id}/complete`)}>Mark completed</button>}
            {!j.asWorker && j.status === "completed" && !j.rated && <button className={btn} onClick={() => { const s = Number(ask("Rating 1-5")); if (s) act(`/api/jobs/${j.id}/rate`, { stars: s, comment: ask("Comment (optional)") || undefined }); }}>Rate worker</button>}
            {!j.asWorker && j.status === "pending_payment" && <button className={btn} onClick={async () => { const r = await api(`/api/jobs/${j.id}/pay`, { body: {} }); if (r.authorizationUrl) location.href = r.authorizationUrl; else load(); }}>Pay fee</button>}
            {!j.asWorker && ["pending_payment", "open", "claimed", "engaged"].includes(j.status) && <button className={btn2} onClick={() => confirm("Cancel this job? Cancelling a live job costs 1 customer point.") && act(`/api/jobs/${j.id}/cancel`)}>Cancel</button>}
          </div>
        </Card>))}
    </Shell>
  );
}
