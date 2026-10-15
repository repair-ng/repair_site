"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { btn, Card, Err, Field, input, Shell } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/auth/login", { body: { email, password } }); window.location.href = "/dashboard"; }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Shell title="Log in">
      <Card><form onSubmit={submit}>
        <Field label="Email"><input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></Field>
        <Field label="Password"><input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} /></Field>
        <button className={btn} disabled={busy}>{busy ? "..." : "Log in"}</button><Err msg={err} />
        <p className="mt-3 text-xs text-ink/50">New here? <Link href="/register" className="underline">Create an account</Link></p>
      </form></Card>
    </Shell>
  );
}
