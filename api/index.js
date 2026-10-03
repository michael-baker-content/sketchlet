// Vercel adapter; the local server uses the same application handler.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = req.query?.__sketchlet_path ?? url.searchParams.get('__sketchlet_path');
    if (typeof path !== 'string' || !/^[a-zA-Z0-9/-]+$/.test(path)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' })); return;
    }
    const { handleApi } = await import('../backend/api.mjs');
    await handleApi(req, res, `/api/${path}`);
  } catch {
    console.error('Sketchlet function could not initialize. Check deployment environment settings.');
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'the gallery is temporarily unavailable. your draft is still on this device.' }));
    } else res.end();
  }
}
