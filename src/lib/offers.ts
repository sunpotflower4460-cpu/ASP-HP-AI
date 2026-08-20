import exampleOffer from '../../data/offers/example.json';

export type Offer = typeof exampleOffer;
const offers: Offer[] = [exampleOffer];

export function getOffer(id: string): Offer | undefined {
  return offers.find((offer) => offer.id === id);
}

export function getActiveOffers(): Offer[] {
  return offers.filter((offer) => offer.status === 'active' && offer.affiliateUrl);
}
