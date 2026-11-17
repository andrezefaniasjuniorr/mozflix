const PRIVATE_HOST_PATTERNS = [
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

function isBlockedHost(hostname) {
  return PRIVATE_HOST_PATTERNS.some((rx) => rx.test(hostname));
}

function forceHttp(raw) {
  let clean = String(raw || '').trim();
  if (!clean) return '';
  if (clean.startsWith('//')) clean = `http:${clean}`;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(clean)) clean = `http://${clean}`;
  return clean.replace(/^https:\/\//i, 'http://');
}

function decodeBase64Url(token) {
  const norm = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toProxyPath(targetUrl) {
  return `/api/stream?t=${encodeBase64Url(forceHttp(targetUrl))}`;
}

function resolveHttpRelative(refUrl, baseUrl) {
  try {
    return forceHttp(new URL(refUrl, baseUrl).toString());
  } catch {
    return forceHttp(refUrl);
  }
}

function rewriteM3u8(playlistText, finalUrl) {
  const lines = playlistText.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      return line.replace(/URI=(["'])([^"']+)\1/gi, (_m, q, uri) => {
        const abs = resolveHttpRelative(uri, finalUrl);
        return `URI=${q}${toProxyPath(abs)}${q}`;
      });
    }

    const abs = resolveHttpRelative(trimmed, finalUrl);
    return toProxyPath(abs);
  });
  return out.join('\n');
}

function injectHtmlHttpGuard(html, finalUrl) {
  const originHttp = forceHttp(new URL(finalUrl).origin);
  const guardScript = `<script>(function(){
    var BASE = ${JSON.stringify(forceHttp(finalUrl))};
    var ORIGIN_HTTP = ${JSON.stringify(originHttp)};
    function stripS(u){
      if(!u || typeof u !== 'string') return u;
      var s = u.trim();
      if(!s || s.indexOf('blob:')===0 || s.indexOf('data:')===0 || s.indexOf('/api/stream')===0) return s;
      if(s.indexOf('//')===0) s = 'http:' + s;
      if(s.indexOf('/')===0) s = ORIGIN_HTTP + s;
      else if(!/^[a-zA-Z][a-zA-Z0-9+\\-.]*:/.test(s)){
        try { s = new URL(s, BASE).toString(); } catch(e){}
      }
      return s.replace(/^https:\\/\\//i, 'http://');
    }
    function enc(u){
      var clean = stripS(u);
      if(!clean || clean.indexOf('http://')!==0) return clean;
      try {
        var bytes = new TextEncoder().encode(clean);
        var bin = '';
        for(var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
        return '/api/stream?t=' + btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      } catch(e){
        return '/api/stream?u=' + encodeURIComponent(clean);
      }
    }
    var origFetch = window.fetch;
    if(origFetch){
      window.fetch = function(input, init){
        try{
          if(typeof input === 'string' && /^https?:\\/\\//i.test(stripS(input))){
            return origFetch.call(this, enc(input), init);
          }
          if(input && input.url && /^https?:\\/\\//i.test(stripS(input.url))){
            return origFetch.call(this, new Request(enc(input.url), input), init);
          }
        }catch(e){}
        return origFetch.apply(this, arguments);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      try{
        if(typeof url === 'string' && /^https?:\\/\\//i.test(stripS(url))){
          var args = Array.prototype.slice.call(arguments);
          args[1] = enc(url);
          return origOpen.apply(this, args);
        }
      }catch(e){}
      return origOpen.apply(this, arguments);
    };
    var mediaDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if(mediaDesc && mediaDesc.set){
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: mediaDesc.get,
        set: function(val){
          return mediaDesc.set.call(this, typeof val === 'string' && /^https?:\\/\\//i.test(stripS(val)) ? enc(val) : val);
        },
        configurable: true
      });
    }
  })();</script>`;

  const rewrittenAttrs = html.replace(
    /\b(src|href|poster)=["'](https:\/\/[^"']+)["']/gi,
    (_m, attr, urlVal) => {
      if (/\.(css|js|png|jpg|jpeg|webp|svg|woff2?)(\?|$)/i.test(urlVal)) {
        return `${attr}="${toProxyPath(urlVal)}"`;
      }
      return `${attr}="${forceHttp(urlVal)}"`;
    }
  );

  if (/<head[^>]*>/i.test(rewrittenAttrs)) {
    return rewrittenAttrs.replace(/<head([^>]*)>/i, `<head$1>${guardScript}`);
  }
  return `${guardScript}${rewrittenAttrs}`;
}

async function fetchHttpFollowingStrippedRedirects(initialUrl, reqHeaders) {
  let currentUrl = forceHttp(initialUrl);
  const visited = new Set();

  for (let hop = 0; hop < 6; hop += 1) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' || isBlockedHost(parsed.hostname)) {
      throw new Error('Blocked stream destination');
    }
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    const headers = new Headers();
    const range = reqHeaders.get('Range');
    if (range) headers.set('Range', range);
    headers.set('Accept', reqHeaders.get('Accept') || '*/*');
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    );

    const upstream = await fetch(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get('Location');
      if (!location) return { upstream, finalUrl: currentUrl };
      currentUrl = resolveHttpRelative(location, currentUrl);
      continue;
    }

    return { upstream, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects');
}

async function handleStreamRequest(request, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
        'X-MozFlix-Stream': '1',
      },
    });
  }

  if (url.searchParams.get('ping') === '1') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-MozFlix-Stream': '1',
      },
    });
  }

  const token = url.searchParams.get('t');
  const rawParam = url.searchParams.get('u');
  let rawTarget = '';

  if (token) {
    try {
      rawTarget = decodeBase64Url(token);
    } catch {
      return new Response('', { status: 400, headers: { 'X-MozFlix-Stream': '1' } });
    }
  } else if (rawParam) {
    rawTarget = rawParam;
  }

  const targetHttpUrl = forceHttp(rawTarget);
  if (!targetHttpUrl || !targetHttpUrl.startsWith('http://')) {
    return new Response('', { status: 400, headers: { 'X-MozFlix-Stream': '1' } });
  }

  try {
    const { upstream, finalUrl } = await fetchHttpFollowingStrippedRedirects(
      targetHttpUrl,
      request.headers
    );

    const contentType = (upstream.headers.get('Content-Type') || '').toLowerCase();
    const isHls =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      finalUrl.toLowerCase().includes('.m3u8');

    if (isHls) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, finalUrl);
      return new Response(rewritten, {
        status: upstream.status === 206 ? 200 : upstream.status,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'X-MozFlix-Stream': '1',
        },
      });
    }

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      const injected = injectHtmlHttpGuard(html, finalUrl);
      return new Response(injected, {
        status: upstream.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'X-MozFlix-Stream': '1',
        },
      });
    }

    const outHeaders = new Headers();
    const passHeaders = [
      'Content-Type',
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Disposition',
    ];
    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }
    if (!outHeaders.has('Content-Type')) {
      outHeaders.set('Content-Type', 'video/mp4');
    }
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    outHeaders.set('Cache-Control', 'no-store');
    outHeaders.set('X-MozFlix-Stream', '1');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch {
    return new Response('', {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-MozFlix-Stream': '1',
      },
    });
  }
}

function applyAssetHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  if (pathname === '/sw.js') {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Service-Worker-Allowed', '/');
  } else if (pathname === '/manifest.webmanifest') {
    headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600');
  } else if (pathname === '/.well-known/assetlinks.json') {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/stream' || url.pathname === '/api/stream/') {
      return handleStreamRequest(request, url);
    }

    if (!env.ASSETS) {
      return new Response('Not found', { status: 404 });
    }

    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET') {
      const accept = request.headers.get('Accept') || '';
      const hasFileExt = /\.[a-z0-9]{2,6}$/i.test(url.pathname);
      if (!hasFileExt && accept.includes('text/html')) {
        res = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
      }
    }

    return applyAssetHeaders(res, url.pathname);
  },
};
