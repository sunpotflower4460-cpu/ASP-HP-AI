export type TrackingContext = {
  pageId: string;
  offerId: string;
  ctaId: string;
  positionId: string;
};

export function buildTrackedAffiliateUrl(rawUrl: string, ctx: TrackingContext) {
  if (!rawUrl) return '';
  const url = new URL(rawUrl);
  url.searchParams.set('id1', ctx.pageId);
  url.searchParams.set('id2', ctx.offerId);
  url.searchParams.set('id3', ctx.ctaId);
  url.searchParams.set('id4', ctx.positionId);
  return url.toString();
}
