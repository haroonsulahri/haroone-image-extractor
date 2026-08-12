async (page) => {
  await page.setContent(`
    <main>
      <img
        alt="pixel"
        src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nEAAAAAASUVORK5CYII="
      >
      <div
        style="width: 20px; height: 10px; background-image: url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)"
      ></div>
      <svg width="30" height="20" viewBox="0 0 30 20">
        <rect width="30" height="20" fill="red"></rect>
      </svg>
    </main>
  `);

  await page.evaluate(() => {
    window.__imageExtractorListener = null;
    window.chrome.runtime = {
      onMessage: {
        addListener(listener) {
          window.__imageExtractorListener = listener;
        }
      }
    };
  });

  await page.addScriptTag({ path: "content.js" });
  const scan = await page.evaluate(() => new Promise((resolve, reject) => {
    if (typeof window.__imageExtractorListener !== "function") {
      reject(new Error("Scanner message listener was not registered"));
      return;
    }

    window.__imageExtractorListener(
      { type: "IMAGERIP_SCAN", force: true },
      {},
      resolve
    );
  }));

  await page.addScriptTag({ path: "libs/zip-writer.js" });
  const zip = await page.evaluate(async () => {
    const writer = new window.StoredZipWriter();
    writer.file("scan.json", JSON.stringify({ ok: true }));
    const blob = await writer.generateAsync({ type: "blob" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return {
      type: blob.type,
      size: blob.size,
      localSignature: view.getUint32(0, true),
      endSignature: view.getUint32(bytes.length - 22, true)
    };
  });

  if (!scan.ok || scan.images.length < 3) {
    throw new Error(`Expected at least three extracted images, received ${scan.images.length}`);
  }
  if (zip.type !== "application/zip" || zip.localSignature !== 0x04034b50 || zip.endSignature !== 0x06054b50) {
    throw new Error("Browser ZIP smoke test failed");
  }

  return {
    extractedImages: scan.images.length,
    formats: [...new Set(scan.images.map((image) => image.format))].sort(),
    zipBytes: zip.size
  };
}
