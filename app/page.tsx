import Link from "next/link";
import { HeroCarousel } from "@/components/HeroCarousel";
import { HERO_IMAGES } from "@/lib/config";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-navy px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-signal font-display text-lg font-bold text-white">R</div>
        <span className="font-display text-xl font-semibold tracking-tight text-white">RE-PAIR</span>
      </div>
      <HeroCarousel images={HERO_IMAGES} />
      <p className="mb-6 max-w-md text-center text-white/70">Find reliable, rated repair workers — or find jobs near you — without the guesswork.</p>
      <div className="flex gap-3">
        <Link href="/register" className="rounded-ticket bg-signal px-5 py-3 text-sm font-semibold text-white">Create account</Link>
        <Link href="/login" className="rounded-ticket border border-white/30 px-5 py-3 text-sm font-semibold text-white">Log in</Link>
      </div>
    </main>
  );
}
