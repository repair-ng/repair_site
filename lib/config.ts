// ---------------------------------------------------------------------------
// RE-PAIR — app configuration
// Live locations (areas), repair services and landing-page images. Fees and
// scoring rules live in lib/rules.ts.
// ---------------------------------------------------------------------------

export type Location = {
  id: string;
  name: string; // e.g. "Ikeja, Lagos"
};

// Locations you currently cover. Add/remove freely — the searchable
// dropdown on the home screen is generated from this list.
export const LOCATIONS: Location[] = [
  { id: "ikeja", name: "Ikeja, Lagos" },
  { id: "yaba", name: "Yaba, Lagos" },
  { id: "surulere", name: "Surulere, Lagos" },
  { id: "lekki", name: "Lekki, Lagos" },
  { id: "ajah", name: "Ajah, Lagos" },
  { id: "ikorodu", name: "Ikorodu, Lagos" },
  { id: "victoria-island", name: "Victoria Island, Lagos" },
  { id: "festac", name: "Festac Town, Lagos" },
  { id: "abuja-central", name: "Abuja Central, FCT" },
  { id: "wuse", name: "Wuse, Abuja" },
];

// Images shown in the auto-scrolling banner at the top of the landing page.
// Ships with the placeholder illustrations in /public/images/hero — drop
// your own photos of repairmen at work into that folder (or anywhere in
// /public) and update the paths below. Each entry needs a `src` (path
// under /public, starting with "/") and descriptive `alt` text.
export type HeroImage = { src: string; alt: string };

export const HERO_IMAGES: HeroImage[] = [
  { src: "/images/hero/autoRepairMan.png", alt: "Technician repairing a smartphone" },
  { src: "/images/hero/phoneRepairMan.png", alt: "Repairman servicing a home appliance" },
  { src: "/images/hero/acRepairMan.png", alt: "Technician servicing an air conditioner" },
  { src: "/images/hero/electricalRepairMan.png", alt: "Electrician fixing household wiring" },
];

export type Service = {
  id: string;
  name: string;
  description?: string;
  keywords: string[]; // searchable tags added to every job posted under this service
};

// Repair categories you currently support. Shown as a dropdown on the
// service-selection screen.
export const SERVICES: Service[] = [
  { id: "phone", name: "Phone & tablet repair", description: "Cracked screens, batteries, charging ports", keywords: ["phone fixing", "screen replacement", "battery replacement"] },
  { id: "laptop", name: "Laptop & computer repair", description: "Hardware faults, screen, keyboard", keywords: ["laptop fixing", "computer repair", "keyboard replacement"] },
  { id: "ac", name: "Air conditioner repair", description: "Servicing, gas refill, faults", keywords: ["ac repair", "air conditioner", "gas refill"] },
  { id: "fridge", name: "Fridge & freezer repair", description: "Cooling issues, compressor faults", keywords: ["refrigerator fixing", "freezer", "compressor"] },
  { id: "washing-machine", name: "Washing machine repair", description: "Not spinning, leaks, drainage", keywords: ["washing machine", "laundry", "drainage"] },
  { id: "generator", name: "Generator repair", description: "Servicing and fault diagnosis", keywords: ["generator servicing", "power"] },
  { id: "electrical", name: "Electrical wiring & sockets", description: "Wiring faults, sockets, switches", keywords: ["electrical", "wiring", "fixture", "socket"] },
  { id: "plumbing", name: "Plumbing", description: "Pipes, taps, leaks, blockages", keywords: ["plumbing", "pipes", "leak", "fixture"] },
  { id: "tv", name: "TV & home electronics", description: "Screen, sound, power faults", keywords: ["tv repair", "electronics", "screen"] },
];

export const LOCATION_IDS = LOCATIONS.map((l) => l.id) as readonly string[];
export const SERVICE_IDS = SERVICES.map((s) => s.id) as readonly string[];
