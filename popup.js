(() => {
  const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5535 16.5061C12.4114 16.6615 12.2106 16.75 12 16.75C11.7894 16.75 11.5886 16.6615 11.4465 16.5061L7.44648 12.1311C7.16698 11.8254 7.18822 11.351 7.49392 11.0715C7.79963 10.792 8.27402 10.8132 8.55352 11.1189L11.25 14.0682V3C11.25 2.58579 11.5858 2.25 12 2.25C12.4142 2.25 12.75 2.58579 12.75 3V14.0682L15.4465 11.1189C15.726 10.8132 16.2004 10.792 16.5061 11.0715C16.8118 11.351 16.833 11.8254 16.5535 12.1311L12.5535 16.5061Z" fill="currentColor"></path><path d="M3.75 15C3.75 14.5858 3.41422 14.25 3 14.25C2.58579 14.25 2.25 14.5858 2.25 15V15.0549C2.24998 16.4225 2.24996 17.5248 2.36652 18.3918C2.48754 19.2919 2.74643 20.0497 3.34835 20.6516C3.95027 21.2536 4.70814 21.5125 5.60825 21.6335C6.47522 21.75 7.57754 21.75 8.94513 21.75H15.0549C16.4225 21.75 17.5248 21.75 18.3918 21.6335C19.2919 21.5125 20.0497 21.2536 20.6517 20.6516C21.2536 20.0497 21.5125 19.2919 21.6335 18.3918C21.75 17.5248 21.75 16.4225 21.75 15.0549V15C21.75 14.5858 21.4142 14.25 21 14.25C20.5858 14.25 20.25 14.5858 20.25 15C20.25 16.4354 20.2484 17.4365 20.1469 18.1919C20.0482 18.9257 19.8678 19.3142 19.591 19.591C19.3142 19.8678 18.9257 20.0482 18.1919 20.1469C17.4365 20.2484 16.4354 20.25 15 20.25H9C7.56459 20.25 6.56347 20.2484 5.80812 20.1469C5.07435 20.0482 4.68577 19.8678 4.40901 19.591C4.13225 19.3142 3.9518 18.9257 3.85315 18.1919C3.75159 17.4365 3.75 16.4354 3.75 15Z" fill="currentColor"></path></svg>`;

  const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="currentColor" stroke-width="1.5"></path><path d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="currentColor" stroke-width="1.5"></path></svg>`;

  const state = {
    images: [],
    visible: [],
    filter: "ALL",
    query: "",
    loading: false,
    batchJob: null
  };

  const dom = {};
  let statusTimer = null;
  let batchPollTimer = null;
  let themeMedia = null;

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("unload", stopBatchPolling);

  async function init() {
    setupThemeSync();
    cacheDom();
    bindEvents();
    await Promise.all([scanActiveTab(false), hydrateBatchStatus()]);
  }

  function setupThemeSync() {
    try {
      themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(themeMedia.matches ? "dark" : "light");

      if (typeof themeMedia.addEventListener === "function") {
        themeMedia.addEventListener("change", onThemeChange);
      } else if (typeof themeMedia.addListener === "function") {
        themeMedia.addListener(onThemeChange);
      }
    } catch (_) {
      applyTheme("light");
    }
  }

  function onThemeChange(event) {
    applyTheme(event.matches ? "dark" : "light");
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }

  function cacheDom() {
    dom.count = document.getElementById("countBadge");
    dom.search = document.getElementById("searchInput");
    dom.rescan = document.getElementById("rescanBtn");
    dom.loading = document.getElementById("loadingState");
    dom.empty = document.getElementById("emptyState");
    dom.emptyMsg = document.getElementById("emptyMessage");
    dom.gridWrap = document.getElementById("gridWrapper");
    dom.grid = document.getElementById("imageGrid");
    dom.downloadAll = document.getElementById("downloadAllBtn");
    dom.status = document.getElementById("statusText");
    dom.filters = Array.from(document.querySelectorAll(".filter-btn"));
    dom.progressWrap = document.getElementById("batchProgress");
    dom.progressLabel = document.getElementById("progressLabel");
    dom.progressPercent = document.getElementById("progressPercent");
    dom.progressTrack = document.getElementById("progressTrack");
    dom.progressFill = document.getElementById("progressFill");
  }

  function bindEvents() {
    dom.search.addEventListener("input", () => {
      state.query = dom.search.value.trim().toLowerCase();
      renderGrid();
    });

    for (const button of dom.filters) {
      button.addEventListener("click", () => {
        if (button.classList.contains("hidden")) {
          return;
        }

        state.filter = button.dataset.format || "ALL";
        renderGrid();
      });
    }

    dom.rescan.addEventListener("click", async () => {
      await scanActiveTab(true);
    });

    dom.downloadAll.addEventListener("click", async () => {
      await startBatchDownload();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && !isTypingContext(event.target)) {
        event.preventDefault();
        dom.search.focus();
      }
    });
  }

  async function scanActiveTab(force) {
    setLoading(true);
    setStatus(force ? "Rescanning page..." : "Scanning page...", false, false);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error("No active tab found.");
      }

      if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || "")) {
        throw new Error("Chrome blocks extensions on this page type.");
      }

      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: "IMAGERIP_SCAN", force: Boolean(force) });
      } catch (error) {
        const message = toErrorMessage(error);
        if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          });
          response = await chrome.tabs.sendMessage(tab.id, { type: "IMAGERIP_SCAN", force: true });
        } else {
          throw error;
        }
      }

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Failed to scan this page.");
      }

      state.images = (Array.isArray(response.images) ? response.images : []).map((image, index) =>
        normalizeImage(image, index)
      );

      renderGrid();
      setStatus(`${state.images.length} images indexed.`);
    } catch (error) {
      state.images = [];
      state.visible = [];
      showEmpty(toErrorMessage(error));
      updateCount(0, 0);
      syncDownloadButtonState();
      setStatus(toErrorMessage(error), true);
    } finally {
      setLoading(false);
      renderGrid();
    }
  }

  function normalizeImage(image, index) {
    const rawUrl = image && typeof image.url === "string" ? image.url : "";
    const format = normalizeFormat((image && image.format) || detectFormatFromUrl(rawUrl));

    return {
      url: rawUrl,
      type: (image && image.type) || "unknown",
      width: toDimension(image && image.width),
      height: toDimension(image && image.height),
      alt: (image && image.alt) || "",
      format,
      warning: (image && image.warning && String(image.warning)) || "",
      filename: deriveFilename(rawUrl, index, format),
      key: rawUrl || `img-${index}`
    };
  }

  function renderGrid() {
    if (state.loading) {
      return;
    }

    updateFilterVisibility();

    state.visible = state.images.filter((image) => {
      const category = getFilterCategory(image.format);
      const matchesFormat = state.filter === "ALL" || state.filter === category;
      if (!matchesFormat) {
        return false;
      }

      if (!state.query) {
        return true;
      }

      const haystack = `${image.filename} ${image.url}`.toLowerCase();
      return haystack.includes(state.query);
    });

    updateCount(state.visible.length, state.images.length);

    if (!state.visible.length) {
      showEmpty(state.images.length ? "No images match the current filter." : "No images found on this page.");
      dom.gridWrap.classList.add("hidden");
      dom.grid.replaceChildren();
      syncDownloadButtonState();
      return;
    }

    hideEmpty();
    dom.gridWrap.classList.remove("hidden");

    const fragment = document.createDocumentFragment();
    state.visible.forEach((image, index) => {
      fragment.appendChild(buildCard(image, index));
    });
    dom.grid.replaceChildren(fragment);

    syncDownloadButtonState();
  }

  function updateFilterVisibility() {
    const counts = getFormatCounts();

    for (const button of dom.filters) {
      const format = button.dataset.format || "ALL";
      if (format === "ALL") {
        button.classList.remove("hidden");
        continue;
      }

      button.classList.toggle("hidden", !counts[format]);
    }

    if (state.filter !== "ALL") {
      const active = dom.filters.find((button) => (button.dataset.format || "ALL") === state.filter);
      if (!active || active.classList.contains("hidden")) {
        state.filter = "ALL";
      }
    }

    for (const button of dom.filters) {
      const format = button.dataset.format || "ALL";
      button.classList.toggle("active", format === state.filter);
    }
  }

  function getFormatCounts() {
    const counts = {
      ALL: state.images.length,
      JPG: 0,
      PNG: 0,
      SVG: 0,
      GIF: 0,
      WEBP: 0,
      OTHER: 0
    };

    for (const image of state.images) {
      const category = getFilterCategory(image.format);
      if (Object.prototype.hasOwnProperty.call(counts, category)) {
        counts[category] += 1;
      } else {
        counts.OTHER += 1;
      }
    }

    return counts;
  }

  function buildCard(image, index) {
    const card = document.createElement("article");
    card.className = "image-card";
    card.setAttribute("role", "listitem");
    card.style.animationDelay = `${Math.min(index, 20) * 20}ms`;
    card.title = image.filename;

    const preview = document.createElement("div");
    preview.className = "preview-wrap";

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = image.url;
    img.alt = image.alt || image.filename;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      preview.replaceChild(createPlaceholder(), img);
    });
    preview.appendChild(img);

    const formatBadge = document.createElement("span");
    formatBadge.className = `format-badge ${getFilterCategory(image.format).toLowerCase()}`;
    formatBadge.textContent = getFilterCategory(image.format);
    preview.appendChild(formatBadge);

    const dimensions = document.createElement("span");
    dimensions.className = "dim-label";
    dimensions.textContent = image.width && image.height ? `${image.width}x${image.height}` : "Unknown";
    preview.appendChild(dimensions);

    if (image.warning) {
      const warning = document.createElement("span");
      warning.className = "warning-badge";
      warning.textContent = "!";
      warning.title = image.warning;
      preview.appendChild(warning);
    }

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.append(
      makeIconButton("Download image", DOWNLOAD_ICON, () => downloadSingle(image), "download-btn"),
      makeIconButton("Copy image URL", COPY_ICON, () => copyText(image.url, "Image URL copied."), "copy-btn")
    );
    preview.appendChild(overlay);

    const filename = document.createElement("div");
    filename.className = "file-name";
    filename.textContent = image.filename;
    filename.title = image.filename;

    card.append(preview, filename);
    return card;
  }

  function makeIconButton(label, svgMarkup, action, variantClass) {
    const button = document.createElement("button");
    button.className = `icon-btn ${variantClass}`;
    button.type = "button";
    button.innerHTML = svgMarkup;
    button.title = label;
    button.setAttribute("aria-label", label);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await action();
      } catch (error) {
        setStatus(toErrorMessage(error), true);
      }
    });

    return button;
  }

  function createPlaceholder() {
    const div = document.createElement("div");
    div.className = "placeholder";
    div.textContent = "◻";
    return div;
  }

  async function downloadSingle(image) {
    if (!image || !image.url) {
      setStatus("Invalid image URL.", true);
      return;
    }

    setStatus(`Downloading ${truncate(image.filename, 26)}...`, false, false);

    const response = await chrome.runtime.sendMessage({
      type: "IMAGERIP_DOWNLOAD_ONE",
      image
    });

    if (!response || !response.ok) {
      image.warning = "Download blocked (CORS/auth).";
      renderGrid();
      throw new Error((response && response.error) || "Failed to download image.");
    }

    setStatus("Download started.");
  }

  async function startBatchDownload() {
    if (!state.images.length) {
      setStatus("No images to download.", true);
      return;
    }

    if (state.batchJob && isBatchRunning(state.batchJob)) {
      startBatchPolling();
      setStatus("Download already in progress.");
      return;
    }

    const payload = state.images
      .filter((image) => image && image.url)
      .map((image) => ({ url: image.url, format: image.format }));

    if (!payload.length) {
      setStatus("No valid image URLs found.", true);
      return;
    }

    setStatus(`Preparing zip for ${payload.length} image(s)...`, false, false);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "IMAGERIP_DOWNLOAD_BATCH_START",
        images: payload
      });

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Batch download failed.");
      }

      applyBatchJob(response.job || null);
      startBatchPolling();
    } catch (error) {
      setStatus(toErrorMessage(error), true, false);
    }
  }

  async function hydrateBatchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "IMAGERIP_DOWNLOAD_BATCH_STATUS" });
      if (response && response.ok && response.job) {
        applyBatchJob(response.job);
        if (isBatchRunning(response.job)) {
          startBatchPolling();
        }
      } else {
        applyBatchJob(null);
      }
    } catch (_) {
      applyBatchJob(null);
    }
  }

  function startBatchPolling() {
    if (batchPollTimer) {
      return;
    }

    batchPollTimer = setInterval(() => {
      void pollBatchStatus();
    }, 500);
  }

  function stopBatchPolling() {
    if (batchPollTimer) {
      clearInterval(batchPollTimer);
      batchPollTimer = null;
    }
  }

  async function pollBatchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "IMAGERIP_DOWNLOAD_BATCH_STATUS" });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to read batch status.");
      }

      applyBatchJob(response.job || null);

      if (!response.job || !isBatchRunning(response.job)) {
        stopBatchPolling();
      }
    } catch (error) {
      stopBatchPolling();
      if (state.batchJob && isBatchRunning(state.batchJob)) {
        setStatus(toErrorMessage(error), true);
      }
    }
  }

  function applyBatchJob(job) {
    const previous = state.batchJob;
    const wasRunning = isBatchRunning(previous);
    state.batchJob = isBatchRunning(job) ? job : null;

    renderBatchProgress(state.batchJob);
    syncDownloadButtonState();

    if (wasRunning && !state.batchJob) {
      clearStatus();
    }
  }

  function applyFailureWarnings(job) {
    if (!job || !Array.isArray(job.failed) || !job.failed.length || !state.images.length) {
      return;
    }

    const failedMap = new Map();
    for (const item of job.failed) {
      if (item && item.url) {
        failedMap.set(item.url, item.reason || "CORS/blocked");
      }
    }

    if (!failedMap.size) {
      return;
    }

    let changed = false;
    for (const image of state.images) {
      if (failedMap.has(image.url)) {
        image.warning = `Blocked: ${failedMap.get(image.url)}`;
        changed = true;
      }
    }

    if (changed) {
      renderGrid();
    }
  }

  function renderBatchProgress(job) {
    if (!dom.progressWrap || !dom.progressFill || !dom.progressTrack || !dom.progressLabel || !dom.progressPercent) {
      return;
    }

    dom.progressWrap.classList.remove("active", "done", "error");

    if (!job) {
      dom.progressLabel.textContent = "";
      dom.progressPercent.textContent = "";
      dom.progressFill.style.width = "0%";
      dom.progressTrack.setAttribute("aria-valuenow", "0");
      return;
    }

    const percent = resolveBatchPercent(job);
    dom.progressWrap.classList.add("active");

    if (job.status === "done") {
      dom.progressWrap.classList.add("done");
    } else if (job.status === "error") {
      dom.progressWrap.classList.add("error");
    }

    dom.progressLabel.textContent = buildBatchLabel(job);
    dom.progressPercent.textContent = `${percent}%`;
    dom.progressFill.style.width = `${percent}%`;
    dom.progressTrack.setAttribute("aria-valuenow", String(percent));
  }

  function buildBatchLabel(job) {
    if (!job) {
      return "";
    }

    if (job.status === "done") {
      return "Completed";
    }

    if (job.status === "error") {
      return job.error || "Failed";
    }

    const total = Number(job.total) || 0;
    const processed = Math.min(Number(job.processed) || 0, total);

    if ((job.phase || "").toLowerCase().startsWith("fetching") && total) {
      return `Fetching ${processed}/${total}`;
    }

    return job.phase || "Preparing";
  }

  function resolveBatchPercent(job) {
    if (!job) {
      return 0;
    }

    if (job.status === "done") {
      return 100;
    }

    const fromJob = clampPercent(Number(job.progress) || 0);
    const total = Number(job.total) || 0;
    const processed = Math.min(Number(job.processed) || 0, total);
    const derived = total ? clampPercent(Math.round((processed / total) * 90)) : 0;
    return Math.max(fromJob, derived);
  }

  function syncDownloadButtonState() {
    if (!dom.downloadAll) {
      return;
    }

    if (state.batchJob && isBatchRunning(state.batchJob)) {
      const total = Number(state.batchJob.total) || 0;
      const processed = Math.min(Number(state.batchJob.processed) || 0, total);
      dom.downloadAll.disabled = true;
      dom.downloadAll.textContent = total ? `Downloading ${processed}/${total}` : "Downloading...";
      return;
    }

    dom.downloadAll.disabled = !state.images.length;
    dom.downloadAll.textContent = "Download All";
  }

  function isBatchRunning(job) {
    return Boolean(job && job.status === "running");
  }

  async function copyText(value, successMessage) {
    if (!value) {
      setStatus("Nothing to copy.", true);
      return;
    }

    await navigator.clipboard.writeText(value);
    setStatus(successMessage || "Copied.");
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    dom.loading.classList.toggle("active", isLoading);

    if (isLoading) {
      dom.gridWrap.classList.add("hidden");
      dom.empty.classList.remove("active");
    }

    syncDownloadButtonState();
  }

  function showEmpty(message) {
    dom.emptyMsg.textContent = message;
    dom.empty.classList.add("active");
  }

  function hideEmpty() {
    dom.empty.classList.remove("active");
  }

  function updateCount(visible, total) {
    dom.count.textContent = total && visible !== total ? `${visible}/${total} indexed` : `${visible} images indexed`;
  }

  function setStatus(message, isError = false, autoClear = true) {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }

    const hasMessage = Boolean(message);
    dom.status.textContent = message || "";
    dom.status.classList.toggle("active", hasMessage);
    dom.status.classList.toggle("error", hasMessage && Boolean(isError));

    if (autoClear && hasMessage) {
      statusTimer = setTimeout(() => {
        dom.status.textContent = "";
        dom.status.classList.remove("active", "error");
      }, 4200);
    }
  }

  function clearStatus() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    dom.status.textContent = "";
    dom.status.classList.remove("active", "error");
  }

  function getFilterCategory(format) {
    const normalized = normalizeFormat(format);
    if (["jpg", "png", "svg", "gif", "webp"].includes(normalized)) {
      return normalized.toUpperCase();
    }
    return "OTHER";
  }

  function normalizeFormat(format) {
    const value = String(format || "").toLowerCase();
    if (value === "jpeg") {
      return "jpg";
    }
    if (["jpg", "png", "svg", "gif", "webp", "ico", "avif", "bmp"].includes(value)) {
      return value;
    }
    return "other";
  }

  function detectFormatFromUrl(url) {
    if (!url) {
      return "other";
    }

    const dataMatch = /^data:([^;,]+)[;,]/i.exec(url);
    if (dataMatch) {
      return normalizeFormat(dataMatch[1].split("/").pop());
    }

    const extMatch = url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
    return extMatch ? normalizeFormat(extMatch[1]) : "other";
  }

  function deriveFilename(url, index, format) {
    const extension = format === "other" ? "img" : format;
    const fallback = `image-${String(index + 1).padStart(3, "0")}.${extension}`;

    if (!url || /^(data:|blob:)/i.test(url)) {
      return fallback;
    }

    try {
      const parsed = new URL(url);
      let name = decodeSafe(parsed.pathname.split("/").pop() || "")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim();

      if (!name) {
        return fallback;
      }

      if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
        name = `${name}.${extension}`;
      }
      return name;
    } catch (_) {
      return fallback;
    }
  }

  function decodeSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function toDimension(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  function truncate(text, length) {
    if (!text || text.length <= length) {
      return text;
    }
    return `${text.slice(0, Math.max(1, length - 1))}…`;
  }

  function isTypingContext(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
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

  function toErrorMessage(error) {
    if (!error) {
      return "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    return error.message || String(error);
  }
})();



