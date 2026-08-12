# Privacy Policy

Haroone Image Extractor processes webpage image information locally in the browser. It does not collect, sell, or transmit personal data to Haroone or any analytics service.

## Data processed

When the user opens the extension, it scans the active tab for image URLs and previews those images in the popup. The extension may read image elements, CSS background-image values, metadata, inline SVG, canvas output, and same-origin frames on that tab.

The extension does not:

- track browsing history;
- send extracted URLs or page content to an external API;
- use analytics, advertising, or telemetry;
- require an account;
- sell or share user data.

## Local storage

Temporary ZIP-download progress is stored in `chrome.storage.local` so the popup can show the current job after it is reopened. Starting a new ZIP job replaces the previous job status. Uninstalling the extension removes this local extension data.

## Page access

The extension receives temporary access to the active tab only after the user opens the popup. The scanner is injected on demand with Chrome's `activeTab` and `scripting` permissions. The extension does not request persistent access to all visited websites.

## Downloads and network requests

Single-image downloads go directly to Chrome's download manager. For ZIP export, the extension fetches the selected image URLs directly from their original locations in the browser and builds the archive locally. Protected or cross-origin images can be blocked by the source website or browser security policy.

## Contact

For questions or privacy concerns, open an issue in the GitHub repository.
