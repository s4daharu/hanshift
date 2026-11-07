#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

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
  const etag = 'W/"' + stats.size.toString(16) + '-' + Math.floor(stats.mtimeMs).toString(16) + '"';

  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, {
      'Cache-Control': headers['Cache-Control'],
      ETag: etag
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
  stream.on('error', function () {
    if (!response.headersSent) {
      sendText(response, 500, 'Internal server error');
    } else {
      response.destroy();
    }
  });
  stream.pipe(response);
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
