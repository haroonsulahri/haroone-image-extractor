"use strict";

try {
  importScripts("libs/jszip.min.js");
} catch (_) {}

const MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/avif": "avif",
  "image/bmp": "bmp"
};

const JOB_STORAGE_KEY = "imageripBatchJob";
const ZIP_FILE_NAME = "haroone-image-extractor-export.zip";

let activeBatchJob = null;
let runningBatchPromise = null;

void restorePersistedJob();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "IMAGERIP_DOWNLOAD_ONE") {
    downloadOne(message.image)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: msg(error) }));
    return true;
  }

  if (message.type === "IMAGERIP_DOWNLOAD_BATCH_START" || message.type === "IMAGERIP_DOWNLOAD_BATCH") {
    startBatchJob(Array.isArray(message.images) ? message.images : [])
      .then((job) => sendResponse({ ok: true, job }))
      .catch((error) => sendResponse({ ok: false, error: msg(error) }));
    return true;
  }

  if (message.type === "IMAGERIP_DOWNLOAD_BATCH_STATUS") {
    getBatchJobStatus()
      .then((job) => sendResponse({ ok: true, job }))
      .catch((error) => sendResponse({ ok: false, error: msg(error) }));
    return true;
  }
});

async function downloadOne(image) {
  if (!image || typeof image.url !== "string" || !image.url) {
    throw new Error("Invalid image URL");
  }

  const format = norm(image.format);
  let name = buildName(image.url, 0, format, "");

  try {
    const id = await chrome.downloads.download({
      url: image.url,
      filename: name,
      conflictAction: "uniquify",
      saveAs: false
    });
    return { downloadId: id };
  } catch (_) {
    const data = await fetchBlob(image.url);
    const ext = inferExt(image.url, format, data.type);
    name = ensureExt(stripExt(name), ext);
    const downloadable = await makeDownloadUrl(data.blob, data.type || "application/octet-stream");

    try {
      const id = await chrome.downloads.download({
        url: downloadable.url,
        filename: name,
        conflictAction: "uniquify",
        saveAs: false
      });
      return { downloadId: id };
    } finally {
      downloadable.revoke();
    }
  }
}

async function startBatchJob(images) {
  if (typeof JSZip !== "function") {
    throw new Error("JSZip unavailable");
  }

  const normalized = normalizeBatchImages(images);
  if (!normalized.length) {
    throw new Error("No images to download");
  }

  if (activeBatchJob && activeBatchJob.status === "running") {
    return snapshotJob(activeBatchJob);
  }

  const now = Date.now();
  activeBatchJob = {
    id: makeJobId(now),
    status: "running",
    phase: "Preparing",
    total: normalized.length,
    processed: 0,
    added: 0,
    failed: [],
    failedCount: 0,
    progress: 0,
    currentUrl: "",
    error: "",
    fileName: ZIP_FILE_NAME,
    downloadId: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: 0
  };

  await persistJob();

  runningBatchPromise = runBatchJob(activeBatchJob.id, normalized).finally(() => {
    runningBatchPromise = null;
  });

  return snapshotJob(activeBatchJob);
}

async function runBatchJob(jobId, images) {
  if (!isCurrentJob(jobId)) {
    return;
  }

  const zip = new JSZip();
  const used = new Set();

  try {
    for (let i = 0; i < images.length; i += 1) {
      if (!isCurrentJob(jobId)) {
        return;
      }

      const item = images[i];
      activeBatchJob.phase = `Fetching ${i + 1}/${images.length}`;
      activeBatchJob.currentUrl = item.url;
      activeBatchJob.updatedAt = Date.now();
      await persistJob();

      try {
        const data = await fetchBlob(item.url);
        const ext = inferExt(item.url, norm(item.format), data.type);
        const name = unique(buildName(item.url, i, ext, data.type), used);
        zip.file(name, data.blob);
        activeBatchJob.added += 1;
      } catch (error) {
        activeBatchJob.failed.push({
          url: item.url,
          reason: msg(error)
        });
        activeBatchJob.failedCount = activeBatchJob.failed.length;
      }

      activeBatchJob.processed = i + 1;
      activeBatchJob.progress = clampPercent(Math.round((activeBatchJob.processed / activeBatchJob.total) * 90));
      activeBatchJob.updatedAt = Date.now();
      await persistJob();
    }

    if (!activeBatchJob.added) {
      throw new Error("Unable to fetch images");
    }

    activeBatchJob.phase = "Building ZIP";
    activeBatchJob.progress = Math.max(activeBatchJob.progress, 90);
    activeBatchJob.updatedAt = Date.now();
    await persistJob();

    let lastZipPersistAt = 0;
    const zipBlob = await zip.generateAsync({ type: "blob" }, (meta) => {
      if (!isCurrentJob(jobId)) {
        return;
      }

      const percent = Number.isFinite(meta && meta.percent) ? meta.percent : 0;
      activeBatchJob.phase = "Building ZIP";
      activeBatchJob.progress = clampPercent(90 + Math.round(percent * 0.09));
      activeBatchJob.updatedAt = Date.now();

      const now = Date.now();
      if (now - lastZipPersistAt > 300) {
        lastZipPersistAt = now;
        void persistJob();
      }
    });

    if (!isCurrentJob(jobId)) {
      return;
    }

    const downloadable = await makeDownloadUrl(zipBlob, "application/zip");
    try {
      activeBatchJob.phase = "Starting download";
      activeBatchJob.progress = 99;
      activeBatchJob.updatedAt = Date.now();
      await persistJob();

      const downloadId = await chrome.downloads.download({
        url: downloadable.url,
        filename: ZIP_FILE_NAME,
        conflictAction: "uniquify",
        saveAs: false
      });
      void downloadId;
    } finally {
      downloadable.revoke();
    }

    await clearBatchJobState();
  } catch (_) {
    if (!isCurrentJob(jobId)) {
      return;
    }
    await clearBatchJobState();
  }
}

async function getBatchJobStatus() {
  if (activeBatchJob && activeBatchJob.status === "running") {
    return snapshotJob(activeBatchJob);
  }

  const stored = await chrome.storage.local.get(JOB_STORAGE_KEY);
  const persisted = stored && stored[JOB_STORAGE_KEY];
  if (!persisted || persisted.status !== "running") {
    return null;
  }

  activeBatchJob = persisted;
  return snapshotJob(activeBatchJob);
}

async function restorePersistedJob() {
  try {
    const stored = await chrome.storage.local.get(JOB_STORAGE_KEY);
    const persisted = stored && stored[JOB_STORAGE_KEY];
    if (!persisted || persisted.status !== "running") {
      await chrome.storage.local.remove(JOB_STORAGE_KEY);
      return;
    }

    activeBatchJob = null;
    await chrome.storage.local.remove(JOB_STORAGE_KEY);
  } catch (_) {}
}

async function persistJob() {
  if (!activeBatchJob || activeBatchJob.status !== "running") {
    await chrome.storage.local.remove(JOB_STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({
    [JOB_STORAGE_KEY]: snapshotJob(activeBatchJob)
  });
}

async function clearBatchJobState() {
  activeBatchJob = null;
  await chrome.storage.local.remove(JOB_STORAGE_KEY);
}

function snapshotJob(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    total: Number(job.total) || 0,
    processed: Number(job.processed) || 0,
    added: Number(job.added) || 0,
    failed: Array.isArray(job.failed) ? job.failed.slice(0, 500) : [],
    failedCount: Number(job.failedCount) || (Array.isArray(job.failed) ? job.failed.length : 0),
    progress: clampPercent(Number(job.progress) || 0),
    currentUrl: job.currentUrl || "",
    error: job.error || "",
    fileName: job.fileName || ZIP_FILE_NAME,
    downloadId: Number.isFinite(job.downloadId) ? job.downloadId : null,
    startedAt: Number(job.startedAt) || 0,
    updatedAt: Number(job.updatedAt) || 0,
    finishedAt: Number(job.finishedAt) || 0
  };
}

function normalizeBatchImages(images) {
  const list = [];
  const seen = new Set();

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i] || {};
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) {
      continue;
    }

    const dedupeKey = normalizeForDedupe(url);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    list.push({
      url,
      format: norm(item.format)
    });
  }

  return list;
}

function normalizeForDedupe(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return String(url).split("?")[0].split("#")[0];
  }
}

function isCurrentJob(jobId) {
  return Boolean(activeBatchJob && activeBatchJob.id === jobId);
}

function makeJobId(now) {
  return `imagerip-${now}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Math.round(value);
}

async function makeDownloadUrl(blob, mimeType) {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke() {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    };
  }

  const dataUrl = await blobToDataUrl(blob, mimeType);
  return {
    url: dataUrl,
    revoke() {}
  };
}

async function blobToDataUrl(blob, mimeType) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  const base64 = btoa(binary);
  const mime = String(mimeType || blob.type || "application/octet-stream").split(";")[0];
  return `data:${mime};base64,${base64}`;
}

async function fetchBlob(url) {
  const inline = /^(data:|blob:)/i.test(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const options = { signal: controller.signal };

  if (!inline) {
    options.credentials = "include";
    options.cache = "force-cache";
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return {
      blob,
      type: response.headers.get("content-type") || blob.type || ""
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildName(url, index, preferred, type) {
  const base = clean(baseName(url, index));
  const safe = trimDots(base) || `image-${String(index + 1).padStart(3, "0")}`;
  return ensureExt(safe, inferExt(url, preferred, type));
}

function baseName(url, index) {
  if (/^(data:|blob:)/i.test(url)) {
    return `image-${String(index + 1).padStart(3, "0")}`;
  }

  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").pop() || "";
    const decoded = dec(last);
    if (decoded) {
      return decoded;
    }
  } catch (_) {}

  return `image-${String(index + 1).padStart(3, "0")}`;
}

function unique(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const match = name.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match ? `.${match[1]}` : "";
  const stem = ext ? name.slice(0, -ext.length) : name;
  let counter = 1;
  let candidate = `${stem} (${counter})${ext}`;

  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem} (${counter})${ext}`;
  }

  used.add(candidate);
  return candidate;
}

function inferExt(url, preferred, type) {
  const pref = norm(preferred);
  if (pref !== "other") {
    return pref;
  }

  const mimeExt = MIME[(type || "").toLowerCase()];
  if (mimeExt) {
    return mimeExt;
  }

  if (/^data:/i.test(url)) {
    const dataMime = /^data:([^;,]+)[;,]/i.exec(url);
    if (dataMime && MIME[dataMime[1].toLowerCase()]) {
      return MIME[dataMime[1].toLowerCase()];
    }
  }

  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (ext) {
      return norm(ext[1]);
    }
  } catch (_) {}

  return "img";
}

function norm(format) {
  const value = String(format || "").toLowerCase();
  if (value === "jpeg") {
    return "jpg";
  }
  return ["jpg", "png", "gif", "webp", "svg", "ico", "avif", "bmp"].includes(value) ? value : "other";
}

function ensureExt(base, ext) {
  if (/\.[a-z0-9]{2,5}$/i.test(base)) {
    return base;
  }
  return `${base}.${ext && ext !== "other" ? ext : "img"}`;
}

function stripExt(name) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function clean(name) {
  return String(name || "")
    .split("?")[0]
    .split("#")[0]
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function trimDots(name) {
  return String(name || "").replace(/\.+$/g, "").trim();
}

function dec(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function msg(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || String(error);
}
