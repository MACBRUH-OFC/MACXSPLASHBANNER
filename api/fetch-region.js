export default async function handler(req, res) {
  // Enable CORS if you need external access, otherwise this keeps it strict
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const { region } = req.query;

  if (!region) {
    return res.status(400).json({ error: 'Region parameter is required' });
  }

  // Fallback to your URL if the environment variable isn't set yet
  const BASE_API = process.env.HIDDEN_UPSTREAM_API || "https://macxsplash.vercel.app/banner/api/filter";

  try {
    const upstreamUrl = `${BASE_API}?region=${region}`;
    
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Vercel-Secure-Proxy'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch data from source upstream.' });
    }

    const data = await response.json();
    
    // Return the clean data directly back to your frontend
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Proxy Error', details: error.message });
  }
}
