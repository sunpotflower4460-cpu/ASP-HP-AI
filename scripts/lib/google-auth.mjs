import crypto from 'node:crypto';

const b64 = (input) => Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

export async function getGoogleServiceAccountToken({ email, privateKey, scope }) {
  if (!email || !privateKey || !scope) throw new Error('Google service-account email/privateKey/scope are required.');
  const normalizedKey = String(privateKey).replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), normalizedKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok || !body.access_token) throw new Error(`Google OAuth token error ${response.status}: ${body.error_description || body.error || response.statusText}`);
  return body.access_token;
}
