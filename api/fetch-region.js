export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60, stale-while-revalidate=30');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { file } = req.query;

  if (file) {
    const targetUrl = decodeURIComponent(file);
    try {
      const urlParts = req.url.split('?')[0];
      const filename = urlParts.split('/').pop() || '';
      
      if (filename.startsWith('r_')) {
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }

      const mediaResponse = await fetch(targetUrl);
      if (!mediaResponse.ok) {
        return res.status(404).json({ error: 'Asset source target down' });
      }

      const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      
      const arrayBuffer = await mediaResponse.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.status(500).json({ error: 'Asset transmission breakdown' });
    }
  }

  res.setHeader('Content-Type', 'application/json');
  const { _id, _token } = req.query;

  if (!_id || !_token) {
    return res.status(400).json({ error: 'Invalid payload components' });
  }

  let region = "";
  let receivedTimeToken = 0;

  try {
    const decoded = Buffer.from(_token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    region = parts[0];
    receivedTimeToken = parseInt(parts[1], 10);
  } catch (e) {
    return res.status(403).json({ error: 'Malformed token data structure' });
  }

  const currentTimeToken = Math.floor(Date.now() / 60000);
  if (Math.abs(currentTimeToken - receivedTimeToken) > 1) {
    return res.status(403).json({ error: 'Request expired. Session signature timed out.' });
  }

  const hourlyMix = new Date().getUTCHours();
  const dynamicSalt = `salt_${region}_mix_${hourlyMix}`;
  const verificationString = `${region}_${dynamicSalt}_${receivedTimeToken}`;
  
  let expectedHash = 5381;
  for (let i = 0; i < verificationString.length; i++) {
    expectedHash = (expectedHash * 33) ^ verificationString.charCodeAt(i);
  }
  const calculatedId = Math.abs(expectedHash).toString(36);

  if (_id !== calculatedId) {
    return res.status(403).json({ error: 'Cryptographic handshake signature validation failed.' });
  }

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
