import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import http from 'node:http';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const PRIVATE_HOST_RX = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
];

function stripHttpsProtocol(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (clean.startsWith('//')) clean = `http:${clean}`;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(clean)) clean = `http://${clean}`;
  return clean.replace(/^https:\/\//i, 'http://');
}

function decodeBase64UrlNode(token: string): string {
  const norm = token.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(norm, 'base64').toString('utf8');
}

function encodeBase64UrlNode(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function toDevProxyPath(targetUrl: string): string {
  return `/api/stream?t=${encodeBase64UrlNode(stripHttpsProtocol(targetUrl))}`;
}

function resolveDevHttpRelative(refUrl: string, baseUrl: string): string {
  try {
    return stripHttpsProtocol(new URL(refUrl, baseUrl).toString());
  } catch {
    return stripHttpsProtocol(refUrl);
  }
}

function rewriteM3u8Node(text: string, finalUrl: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI=(["'])([^"']+)\1/gi, (_m, q, uri) => {
          return `URI=${q}${toDevProxyPath(resolveDevHttpRelative(uri, finalUrl))}${q}`;
        });
      }
      return toDevProxyPath(resolveDevHttpRelative(trimmed, finalUrl));
    })
    .join('\n');
}

function fetchNodeHttpStream(
  targetUrl: string,
  req: IncomingMessage,
  res: ServerResponse,
  hops = 0
): void {
  if (hops >= 6) {
    res.writeHead(502, {'X-MozFlix-Stream': '1'});
    res.end();
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(stripHttpsProtocol(targetUrl));
  } catch {
    res.writeHead(400, {'X-MozFlix-Stream': '1'});
    res.end();
    return;
  }

  if (parsed.protocol !== 'http:' || PRIVATE_HOST_RX.some((rx) => rx.test(parsed.hostname))) {
    res.writeHead(403, {'X-MozFlix-Stream': '1'});
    res.end();
    return;
  }

  const reqHeaders: Record<string, string> = {
    Accept: String(req.headers.accept || '*/*'),
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  };
  if (req.headers.range) {
    reqHeaders.Range = String(req.headers.range);
  }

  const upstreamReq = http.request(
    {
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 80,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: reqHeaders,
      timeout: 15000,
    },
    (upstreamRes) => {
      const status = upstreamRes.statusCode || 200;
      const loc = upstreamRes.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && loc) {
        upstreamRes.resume();
        const nextUrl = resolveDevHttpRelative(loc, parsed.toString());
        fetchNodeHttpStream(nextUrl, req, res, hops + 1);
        return;
      }

      const ct = String(upstreamRes.headers['content-type'] || '').toLowerCase();
      const isHls =
        ct.includes('mpegurl') ||
        ct.includes('m3u8') ||
        parsed.pathname.toLowerCase().includes('.m3u8');

      if (isHls) {
        const chunks: Buffer[] = [];
        upstreamRes.on('data', (c: Buffer) => chunks.push(c));
        upstreamRes.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const rewritten = rewriteM3u8Node(text, parsed.toString());
          res.writeHead(status === 206 ? 200 : status, {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
            'X-MozFlix-Stream': '1',
          });
          res.end(rewritten);
        });
        return;
      }

      const outHeaders: Record<string, string | string[]> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cache-Control': 'no-store',
        'X-MozFlix-Stream': '1',
      };
      for (const h of [
        'content-type',
        'content-range',
        'accept-ranges',
        'content-length',
        'content-disposition',
      ]) {
        const val = upstreamRes.headers[h];
        if (val) outHeaders[h] = val;
      }
      if (!outHeaders['content-type']) {
        outHeaders['content-type'] = 'video/mp4';
      }

      res.writeHead(status, outHeaders);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, {'X-MozFlix-Stream': '1'});
      res.end();
    }
  });

  upstreamReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, {'X-MozFlix-Stream': '1'});
      res.end();
    }
  });

  req.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.end();
}

function mozflixHttpStreamTunnel(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (
      path: string,
      handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
    ) => void;
  }) => {
    middlewares.use('/api/stream', (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
          'X-MozFlix-Stream': '1',
        });
        res.end();
        return;
      }

      const reqUrl = new URL(req.url || '/', 'http://localhost');
      if (reqUrl.searchParams.get('ping') === '1') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-MozFlix-Stream': '1',
        });
        res.end('ok');
        return;
      }

      const token = reqUrl.searchParams.get('t');
      const rawParam = reqUrl.searchParams.get('u');
      let target = '';
      if (token) {
        try {
          target = decodeBase64UrlNode(token);
        } catch {
          res.writeHead(400, {'X-MozFlix-Stream': '1'});
          res.end();
          return;
        }
      } else if (rawParam) {
        target = rawParam;
      }

      if (!target) {
        res.writeHead(400, {'X-MozFlix-Stream': '1'});
        res.end();
        return;
      }

      fetchNodeHttpStream(target, req, res);
    });
  };

  return {
    name: 'mozflix-http-stream-tunnel',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      mozflixHttpStreamTunnel(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          '.well-known/assetlinks.json',
        ],
        manifest: {
          id: '/',
          name: 'MozFlix',
          short_name: 'MozFlix',
          description: 'Um app de streaming de Filmes, Séries e Canais de TV.',
          theme_color: '#0A0A0C',
          background_color: '#0A0A0C',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'pt-MZ',
          categories: ['entertainment', 'video'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          globIgnores: ['**/_worker.js', '_worker.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/\.well-known\//, /^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({request}) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'mozflix-images-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
