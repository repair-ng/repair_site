"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HeroImage } from "@/lib/config";

export function HeroCarousel({
  images,
  intervalMs = 4000,
}: {
  images: HeroImage[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || images.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [paused, images.length, intervalMs]);

  if (images.length === 0) return null;

  return (
    <div
      className="relative mb-8 w-full max-w-md overflow-hidden rounded-ticket shadow-ticket"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-44 w-full sm:h-56">
        {images.map((img, i) => (
          <div
            key={img.src}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i !== index}
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              sizes="(max-width: 480px) 100vw, 448px"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-signal" : "w-1.5 bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
