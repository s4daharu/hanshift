# HanShift

A simple, polished web app for converting Chinese text between Simplified and Traditional scripts. It runs entirely in the browser and works on phones, tablets, and desktops.

![No build step](https://img.shields.io/badge/build-none-b5412d) ![Runs locally](https://img.shields.io/badge/privacy-local-2f6f5e)

## Features

- **Both directions** — Simplified → Traditional and Traditional → Simplified.
- **Region-aware wording** — Taiwan, Taiwan phrases, Hong Kong, Hong Kong phrases, and OpenCC standard styles, applied in either direction.
- **Live results** — text converts as you type (with a short debounce).
- **Swap** — flip direction and move the current result into the input.
- **Quote styling** — optionally convert `“ ”` to `「 」` and back, with unmatched quotes left alone.
- **Everyday tools** — copy, paste, clear, sample text, and UTF-8 `.txt` download.
- **Useful details** — character/line counts, light/dark themes, and local autosave.
- **Mobile-first layout** — large touch targets, no horizontal scrolling, safe-area support.
- **Private and offline** — no accounts, no uploads, no external requests. The OpenCC engine is bundled locally.

## Run it

No build step and no runtime dependencies are required.

```sh
npm start
```

Open <http://localhost:4173>. Set `PORT` to use a different port:

```sh
PORT=8080 npm start
```

Any static file server works too:

```sh
python3 -m http.server 4173
```

Deploy the repository as-is to any static host.

## Structure

```text
.
├── index.html                 # App markup
├── css/styles.css             # Responsive light/dark styling
├── js/app.js                  # Conversion and UI logic
├── assets/favicon.svg
├── vendor/opencc-js/full.js   # Vendored OpenCC engine
└── server.js                  # Tiny zero-dependency preview server
```

## Conversion engine

[opencc-js](https://github.com/nk2028/opencc-js) 1.4.2 is vendored in `vendor/opencc-js/` so the app has no CDN dependency. Its MIT and Apache-2.0 license texts are included alongside the bundle.

## License

The HanShift app code is released under the MIT License. The bundled OpenCC engine and dictionary data retain their own licenses; see `vendor/opencc-js/`.
