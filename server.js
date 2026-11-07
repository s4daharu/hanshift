#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = fs.realpathSync(path.resolve(__dirname));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

// The preview server is only used locally, but compressing text keeps local
// measurements close to GitHub Pages, which serves everything with gzip.
const COMPRESSIBLE = new Set([
  '.html', '.css', '.js', '.json', '.xml', '.svg',
  '.txt', '.md', '.webmanifest'
]);

function acceptsGzip(header) {
  if (!header) return false;

  for (const part of String(header).split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    if (name !== 'gzip' && name !== '*') continue;

    const qualityParameter = parameters
      .map(function (parameter) { return parameter.trim(); })
      .find(function (parameter) { return parameter.startsWith('q='); });
    const quality = qualityParameter === undefined
      ? undefined
      : Number(qualityParameter.slice(2));

    return quality === undefined || (Number.isFinite(quality) && quality > 0);
  }

  return false;
}

function sendText(response, status, message, extraHeaders) {
  const body = message + '\n';
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(body);
}

const server = http.createServer(async function (request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch (error) {
    sendText(response, 400, 'Bad request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // Do not expose .git, .env, or any other dotfile in the project directory.
  if (pathname.split('/').some(function (segment) {
    return segment.length > 1 && segment.startsWith('.');
  })) {
    sendText(response, 404, 'Not found');
    return;
  }

  const filePath = path.normalize(path.join(ROOT, pathname));

  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let realPath;
  let stats;

  try {
    realPath = await fsp.realpath(filePath);
  } catch (error) {
    sendText(response, 404, 'Not found');
    return;
  }

  // A symlink inside the project must not be able to escape the root.
  if (realPath !== ROOT && !realPath.startsWith(ROOT + path.sep)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    stats = await fsp.stat(realPath);
  } catch (error) {
    sendText(response, 404, 'Not found');
    return;
  }

  if (!stats.isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }

  const extension = path.extname(realPath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const isVendor = realPath.includes(path.sep + 'vendor' + path.sep);
  const useGzip = COMPRESSIBLE.has(extension) &&
    stats.size >= 512 &&
    acceptsGzip(request.headers['accept-encoding']);
  const baseEtag = 'W/"' + stats.size.toString(16) + '-' +
    Math.floor(stats.mtimeMs).toString(16) + (useGzip ? '-gz' : '') + '"';

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: baseEtag,
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };

  if (useGzip) {
    headers['Content-Encoding'] = 'gzip';
  } else {
    headers['Content-Length'] = stats.size;
  }

  if (request.headers['if-none-match'] === baseEtag) {
    response.writeHead(304, {
      'Cache-Control': headers['Cache-Control'],
      ETag: baseEtag,
      Vary: 'Accept-Encoding'
    });
    response.end();
    return;
  }

  response.writeHead(200, headers);

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = fs.createReadStream(realPath);

  if (!useGzip) {
    stream.on('error', function () {
      if (!response.headersSent) {
        sendText(response, 500, 'Internal server error');
      } else {
        response.destroy();
      }
    });
    stream.pipe(response);
    return;
  }

  const gzip = zlib.createGzip({ level: 6 });

  stream.on('error', function () {
    gzip.destroy();
    response.destroy();
  });
  gzip.on('error', function () {
    stream.destroy();
    response.destroy();
  });

  stream.pipe(gzip).pipe(response);
});

server.listen(PORT, HOST, function () {
  const displayHost = HOST === '0.0.0.0' || HOST === '::'
    ? 'localhost'
    : HOST;
  console.log('HanShift is running at http://' + displayHost + ':' + PORT);
});

function shutdown() {
  server.close(function () {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
