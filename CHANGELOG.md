# Changelog

All notable changes to Haroone Image Extractor are documented in this file.

## [1.0.1] - 2026-08-13

### Changed

- Replaced persistent `<all_urls>` content-script access with on-demand scanner injection.
- Replaced the misleading `jszip.min.js` filename with a documented, readable stored-ZIP writer.
- Reformatted the scanner source so contributors can review and maintain it.
- Preserved completed and failed batch status so the popup can report the actual result.
- Reported interrupted background jobs instead of silently discarding them.

### Added

- Privacy policy.
- Automated manifest, JavaScript, ZIP-writer, and release-package validation.

## [1.0.0] - 2026-08-12

### Added

- Image extraction from page elements, metadata, CSS backgrounds, SVG, canvas, and same-origin frames.
- Search and format filters.
- Single-image downloads and local ZIP export.
- Light and dark popup themes.
