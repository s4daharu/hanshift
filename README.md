# HanShift

A simple, polished web app for converting Chinese text between Simplified and Traditional scripts. It runs entirely in the browser and works on phones, tablets, and desktops.

[Live demo](https://s4daharu.github.io/hanshift/) · [Report an issue](https://github.com/s4daharu/hanshift/issues)

![No build step](https://img.shields.io/badge/build-none-b5412d) ![Runs locally](https://img.shields.io/badge/privacy-local-2f6f5e)

## Features

- **Both directions** — Simplified → Traditional and Traditional → Simplified.
- **Region-aware wording** — Taiwan, Taiwan phrases, Hong Kong, Hong Kong phrases, and OpenCC standard styles, applied in either direction.
- **Live results** — text converts as you type (with a short debounce).
- **Direction switching and Swap** — flip direction with the tabs or the Swap button. The current result moves into the input so text is never converted as the wrong script.
- **Quote styling** — optionally convert `“ ”` / `‘ ’` to `「 」` / `『 』` and back. Nested quotes alternate styles, unmatched quotes are left alone, and English apostrophes are preserved.
- **Everyday tools** — copy, paste (adds at the end), clear, sample text, and UTF-8 `.txt` download. Clear and sample replacements can be undone from the toast.
- **Useful details** — character/line counts, light/dark themes, and local autosave.
- **Mobile-first layout** — large touch targets, no horizontal scrolling, and safe-area support.
- **Private and self-contained** — no accounts, no uploads, and no external requests. The OpenCC engine is bundled locally.
- **Keyboard-friendly** — skip link, logical tab order, visible focus styles, and reduced-motion support.

## Run it

No build step and no runtime dependencies are required. Node.js 18 or newer is only needed for the included preview server.

```sh
npm start
```

Open <http://localhost:4173>. Set `PORT` to use a different port:

```sh
PORT=8080 npm start
```

The preview binds to `127.0.0.1` by default. To test from a phone on the same network, bind it to all interfaces and open `http://<computer-ip>:4173`:

```sh
HOST=0.0.0.0 npm start
```

Any static file server works too:

```sh
python3 -m http.server 4173
```

Deploy the repository as-is to any static host.

## Deploy

The project is published with GitHub Pages from the `main` branch root:

<https://s4daharu.github.io/hanshift/>

A `.nojekyll` file tells GitHub Pages to serve the static files as-is.

## Structure

```text
.
├── index.html                 # App markup and metadata
├── css/styles.css             # Responsive light/dark styling
├── js/app.js                  # Conversion and UI logic
├── assets/favicon.svg
├── vendor/opencc-js/full.js   # Vendored OpenCC engine
├── server.js                  # Tiny zero-dependency preview server
├── robots.txt
└── sitemap.xml
```

## Privacy and storage

Conversion happens entirely on the device. The app makes no analytics, CDN, font, or API requests.

The source text, direction, style, and quote setting are saved in `localStorage` under `hanshift.state.v1`; the theme is saved under `hanshift.theme`. Nothing is transmitted. Clearing site data removes the saved text.

## Conversion engine

[opencc-js](https://github.com/nk2028/opencc-js) 1.4.2 is vendored in `vendor/opencc-js/` so the app has no CDN dependency. Its MIT and Apache-2.0 license texts are included alongside the bundle.

## License

The HanShift app code is released under the MIT License. The bundled OpenCC engine and dictionary data retain their own licenses; see `vendor/opencc-js/`.
