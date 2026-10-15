"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type Me = any;
export function useMe(redirect = true) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/api/me").then(setMe).catch(() => { if (redirect) window.location.href = "/login"; }).finally(() => setLoading(false));
  }, [redirect]);
  return { me, loading };
}

export const input = "w-full rounded-ticket border border-line bg-paper px-4 py-3 text-[15px] focus:border-signal focus:outline-none";
export const btn = "rounded-ticket bg-signal px-4 py-2.5 text-sm font-semibold text-white hover:bg-signalDark disabled:opacity-50";
export const btn2 = "rounded-ticket border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-50";

export function Shell({ me, title, children }: { me?: Me | null; title: string; children: React.ReactNode }) {
  const worker = me?.role === "worker";
  return (
    <main className="min-h-screen bg-navy px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
          <Link href="/dashboard" className="font-display text-lg font-semibold text-white">RE-PAIR</Link>
          {me && (<>
            {worker ? <Link href="/jobs">Job board</Link> : <Link href="/jobs/new">Post a job</Link>}
            <Link href="/my-jobs">My jobs</Link>
            <Link href="/workers">Workers</Link>
            {worker && <Link href="/business">Company</Link>}
            <Link href="/bookings">Bookings</Link>
            <Link href="/notifications">Notifications{me.unreadNotifications ? ` (${me.unreadNotifications})` : ""}</Link>
            <button className="ml-auto text-white/50 hover:text-white" onClick={async () => { await api("/api/auth/logout", { method: "POST", body: {} }); window.location.href = "/"; }}>Log out</button>
          </>)}
        </nav>
        <h1 className="mb-4 font-display text-3xl font-semibold text-white">{title}</h1>
        {children}
      </div>
    </main>
  );
}
export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`job-ticket mb-4 p-5 ${className}`}>{children}</div>;
export const Err = ({ msg }: { msg: string | null }) => (msg ? <p className="mt-2 text-xs text-danger">{msg}</p> : null);
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-ink/60">{label}</span>{children}</label>;
}
export const Stars = ({ r }: { r: number | null }) => <span>{r === null ? "Unrated" : `★ ${r.toFixed(2)}`}</span>;
