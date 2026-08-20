export type TrackingContext = {
  pageId: string;
  offerId: string;
  ctaId: string;
  positionId: string;
};

export function buildTrackedAffiliateUrl(rawUrl: string, asp: string, ctx: TrackingContext) {
  if (!rawUrl) return '';
  const url = new URL(rawUrl);

  // A8 officially supports id1-id5 as media-side tracking parameters.
  if (asp.toLowerCase() === 'a8') {
    url.searchParams.set('id1', ctx.pageId);
    url.searchParams.set('id2', ctx.offerId);
    url.searchParams.set('id3', ctx.ctaId);
    url.searchParams.set('id4', ctx.positionId);
  }

  // Other ASP URLs are left untouched unless their official link-generation
  // method explicitly supports custom parameters. Attribution can still be
  // performed with program IDs/referrers in their report APIs.
  return url.toString();
}
