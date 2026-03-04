# Haroone Image Extractor
![Haroone Image Extractor Banner](./assets/images/Image-Extractor-banner.jpg)

Haroone Image Extractor is a Manifest V3 Chrome extension that extracts images from the current webpage, previews them in a fast grid, and downloads single images or all images as a ZIP.

Built by Haroone.

## Screenshot

![Haroone Image Extractor - Light and Dark Popup](./assets/images/Image-Extractor.jpg)

## Features

- Extracts images from `img`, `picture/source`, CSS backgrounds, inline SVG, canvas exports, meta tags, JSON-LD, favicons, and same-origin iframes/shadow DOM.
- Normalizes URLs and deduplicates repeated image links.
- Detects common formats (`jpg`, `png`, `gif`, `webp`, `svg`, `ico`, `avif`, `bmp`).
- Search + format filters in the popup.
- One-click single image download.
- `Download All` ZIP export with progress.
- Download-all progress continues in the background when popup closes.
- Auto light/dark popup theme.

## Install (Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned/downloaded `haroone-image-extractor` folder.

## Usage

1. Open any webpage.
2. Click **Haroone Image Extractor** in the Chrome toolbar.
3. Wait for indexing to complete.
4. Filter/search if needed.
5. Download a single image from a card or click **Download All**.

## Permissions

- `activeTab`: access the active tab on user interaction.
- `scripting`: inject scanner script when needed.
- `downloads`: save images and ZIP files.
- `storage`: persist in-progress batch download state.
- `content_scripts` runs on `<all_urls>` to keep scan startup fast.

## Known Limitations

- Cross-origin iframe content is readable only when same-origin policies allow it.
- Some protected images may fail fetch/download due to auth/CORS restrictions.
- Canvas export can fail on tainted canvases created from restricted cross-origin sources.
- Very large pages may take longer to index and ZIP.

## Build / Package

1. Keep `manifest.json` at the extension root.
2. Zip the extension root contents (not an outer parent folder).
3. Upload the ZIP to the Chrome Web Store Developer Dashboard.

## Chrome Web Store Notes

- Developer registration fee is one-time (`$5 USD`).
- Keep permissions minimal and clearly documented for review.

## Recommended GitHub Topics

- `chrome-extension`
- `browser-extension`
- `manifest-v3`
- `image-downloader`
- `image-extractor`

## Project Structure

```text
haroone-image-extractor/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── icons/
├── libs/
└── assets/images/
```

## License

MIT License. See [LICENSE](./LICENSE).
