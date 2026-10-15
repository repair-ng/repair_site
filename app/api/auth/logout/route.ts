import { destroySession } from "@/lib/auth";
import { publicRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = publicRoute({}, async () => {
  await destroySession();
  return { ok: true };
});
