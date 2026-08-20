export function scoreCommercialIntent({ searchClicks = 0, affiliateClicks = 0, confirmedYen = 0, pendingYen = 0 } = {}) {
  const safeSearchClicks = Math.max(0, Number(searchClicks || 0));
  const safeAffiliateClicks = Math.max(0, Number(affiliateClicks || 0));
  const safeConfirmedYen = Math.max(0, Number(confirmedYen || 0));
  const safePendingYen = Math.max(0, Number(pendingYen || 0));

  const volume = Math.min(35, Math.log2(1 + safeAffiliateClicks) * 8);
  const outboundRate = safeSearchClicks > 0 ? Math.min(1, safeAffiliateClicks / safeSearchClicks) : 0;
  const efficiency = Math.min(25, outboundRate * 100);
  const revenue = safeConfirmedYen > 0 ? 40 : safePendingYen > 0 ? 25 : 0;
  return Math.round(Math.min(100, volume + efficiency + revenue));
}

export function classifyCommercialIntent({ score = 0, confirmedYen = 0, pendingYen = 0 } = {}) {
  if (Number(confirmedYen || 0) > 0) return 'proven';
  if (Number(pendingYen || 0) > 0) return 'strong';
  const safeScore = Number(score || 0);
  if (safeScore >= 60) return 'strong';
  if (safeScore >= 35) return 'promising';
  return 'weak';
}
