export default async function handler(req, res) {
  // Setup standard headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const { _id, _token } = req.query;

  // Reject immediately if parameters are completely missing
  if (!_id || !_token) {
    return res.status(400).json({ error: 'Invalid payload components' });
  }

  let region = "";
  let receivedTimeToken = 0;

  try {
    // Reverse base64 structure masking safely
    const decoded = Buffer.from(_token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    region = parts[0];
    receivedTimeToken = parseInt(parts[1], 10);
  } catch (e) {
    return res.status(403).json({ error: 'Malformed token data structure' });
  }

  // Time Window Verification: Checks if the signature window expired (> 60-90 secs)
  const currentTimeToken = Math.floor(Date.now() / 60000);
  if (Math.abs(currentTimeToken - receivedTimeToken) > 1) {
    return res.status(403).json({ error: 'Request expired. Session signature timed out.' });
  }

  // Run the backend handshake check to recalculate expected hash 
  const verificationString = `${region}_secret_salt_${receivedTimeToken}`;
  let expectedHash = 5381;
  for (let i = 0; i < verificationString.length; i++) {
    expectedHash = (expectedHash * 33) ^ verificationString.charCodeAt(i);
  }
  const calculatedId = Math.abs(expectedHash).toString(36);

  // If hashes don't match, the payload URL was tampered with or fake
  if (_id !== calculatedId) {
    return res.status(403).json({ error: 'Cryptographic handshake signature validation failed.' });
  }

  // Fetch from the environment variable configuration safely hidden away from client views
  const BASE_API = process.env.HIDDEN_UPSTREAM_API || "https://macxsplash.vercel.app/banner/api/filter";

  try {
    const upstreamUrl = `${BASE_API}?region=${region}`;
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Vercel-Secure-Proxy' }
    });

    if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to communicate with upstream server.' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal secure endpoint exception' });
  }
}
