const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;
const PROXY_KEY = process.env.PROXY_KEY || '';
const WECHAT_API_HOST = 'api.weixin.qq.com';

/**
 * WeChat API Proxy Server
 * Forwards requests to api.weixin.qq.com from a fixed cloud IP.
 * This avoids home dynamic IP issues with WeChat's IP whitelist.
 */

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
    return;
  }

  // Check IP endpoint - tells us what IP WeChat sees
  if (req.url === '/check-ip') {
    const ipReq = https.get('https://api.ipify.org?format=json', (ipRes) => {
      let data = '';
      ipRes.on('data', c => data += c);
      ipRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });
    ipReq.on('error', (e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // Auth check
  if (PROXY_KEY) {
    const clientKey = req.headers['x-proxy-key'] || '';
    if (clientKey !== PROXY_KEY) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  // Only allow WeChat API paths
  const allowedPaths = [
    '/cgi-bin/stable_token',
    '/cgi-bin/token',
    '/cgi-bin/media/uploadimg',
    '/cgi-bin/material/add_material',
    '/cgi-bin/draft/add',
  ];

  const urlPath = req.url.split('?')[0];
  if (!allowedPaths.some(p => urlPath.startsWith(p))) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Path not allowed: ${urlPath}` }));
    return;
  }

  // Collect request body
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const options = {
      hostname: WECHAT_API_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: WECHAT_API_HOST },
    };
    // Remove proxy-specific headers
    delete options.headers['x-proxy-key'];

    const proxyReq = https.request(options, (proxyRes) => {
      const responseChunks = [];
      proxyRes.on('data', chunk => responseChunks.push(chunk));
      proxyRes.on('end', () => {
        const responseBody = Buffer.concat(responseChunks);
        // Forward status and headers
        const headers = { ...proxyRes.headers };
        delete headers['transfer-encoding'];
        headers['content-length'] = responseBody.length;
        res.writeHead(proxyRes.statusCode, headers);
        res.end(responseBody);
      });
    });

    proxyReq.on('error', (e) => {
      console.error('[Proxy] Request error:', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${e.message}` }));
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`[WeChat Proxy] Running on port ${PORT}`);
});
