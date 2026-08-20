export function isSafeHttpsUrl(value, { allowPlaceholder = false } = {}) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;

    const hostname = String(url.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname) return false;

    const localOrLoopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);
    if (localOrLoopback) return false;

    const placeholder =
      hostname.endsWith('.example') ||
      /(^|\.)example\.(com|org|net)$/i.test(hostname);
    if (!allowPlaceholder && placeholder) return false;

    return true;
  } catch {
    return false;
  }
}
