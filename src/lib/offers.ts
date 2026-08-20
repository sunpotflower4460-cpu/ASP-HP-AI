export type Offer = {
  id: string;
  name: string;
  asp: 'a8' | 'valuecommerce' | string;
  aspProgramId?: string | number | null;
  status: 'draft' | 'active' | 'paused' | string;
  affiliateUrl: string;
  officialUrl?: string;
  rewardYen?: number | null;
  allowedMedia?: string[];
  decisionTags?: string[];
  activatedAt?: string | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
  facts?: Record<string, {
    value: unknown;
    source: string;
    checkedAt: string;
    ttlDays: number;
  }>;
};

const modules = import.meta.glob('../../data/offers/*.json', { eager: true, import: 'default' }) as Record<string, Offer>;
const offers: Offer[] = Object.values(modules).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));

export function getOffer(id: string): Offer | undefined {
  return offers.find((offer) => offer.id === id);
}

export function getActiveOffers(): Offer[] {
  return offers.filter((offer) => offer.status === 'active' && Boolean(offer.affiliateUrl));
}

export function getAllOffers(): Offer[] {
  return [...offers];
}
