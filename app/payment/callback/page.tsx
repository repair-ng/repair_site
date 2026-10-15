"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { Card, Shell } from "@/components/ui";

// Paystack redirects here. We NEVER trust the redirect: the server re-verifies with Paystack.
export default function Page() { return <Suspense fallback={null}><Inner /></Suspense>; }
function Inner() {
  const sp = useSearchParams();
  const ref = sp.get("reference") ?? sp.get("trxref");
  const [state, setState] = useState<"checking" | "paid" | "pending" | "failed">("checking");
  useEffect(() => {
    if (!ref) { setState("failed"); return; }
    let n = 0;
    const t = setInterval(async () => {
      try { const r = await api(`/api/payments/status?reference=${encodeURIComponent(ref)}`); if (r.status !== "pending") { setState(r.status); clearInterval(t); } else if (++n > 10) { setState("pending"); clearInterval(t); } }
      catch { setState("failed"); clearInterval(t); }
    }, 2000);
    return () => clearInterval(t);
  }, [ref]);
  return (
    <Shell title="Payment">
      <Card>
        {state === "checking" && "Confirming your payment with Paystack…"}
        {state === "paid" && <>✅ Payment confirmed. <a className="underline" href="/my-jobs">Go to my jobs</a> · <a className="underline" href="/business">Company</a></>}
        {state === "pending" && "We haven't received confirmation yet. It will apply automatically once Paystack confirms — check back shortly."}
        {state === "failed" && "We couldn't confirm this payment. If you were charged, contact support with your reference."}
      </Card>
    </Shell>
  );
}
