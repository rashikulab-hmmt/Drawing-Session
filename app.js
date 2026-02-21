const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

const folderFallback = document.getElementById("folder-fallback");
const drawSecondsInput = document.getElementById("draw-seconds");
const drawSecondsLabel = document.getElementById("draw-seconds-label");
const breakSecondsInput = document.getElementById("break-seconds");
const breakSecondsLabel = document.getElementById("break-seconds-label");
const orderModeInputs = Array.from(document.querySelectorAll("input[name='order-mode']"));
const settingsControls = document.getElementById("settings-controls");
const controlsPanel = document.getElementById("controls-panel");
const controlParking = document.getElementById("control-parking");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const nextBtn = document.getElementById("next-btn");
const stopBtn = document.getElementById("stop-btn");
const timerControlsSlot = document.getElementById("timer-controls-slot");
const indexLabel = document.getElementById("index-label");
const timerLabel = document.getElementById("timer-label");
const stageImage = document.getElementById("stage-image");
const imageWrap = document.getElementById("image-wrap");
const restOverlay = document.getElementById("rest-overlay");
const centerOverlay = document.getElementById("center-overlay");

let sourceImages = [];
let sessionImages = [];
let currentIndex = -1;
let phase = "idle";
let timerId = null;
let secondsLeft = 0;
let isPaused = false;
let currentFolderName = "";
let currentTopic = "";
let dragDepth = 0;

function toClock(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (seconds < 60) return `${seconds}秒`;
  if (sec === 0) return `${minutes}分`;
  return `${minutes}分${sec}秒`;
}

function isImageFile(file) {
  const name = String(file?.name || "").toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

function getOrderMode() {
  const selected = orderModeInputs.find((input) => input.checked);
  return selected ? selected.value : "name";
}

function appendTo(parent, child) {
  if (parent && child && child.parentElement !== parent) {
    parent.appendChild(child);
  }
}

function setDragReady(isReady) {
  imageWrap.classList.toggle("drag-ready", isReady);
}

function showCenterText(text) {
  centerOverlay.textContent = text;
  centerOverlay.classList.remove("hidden");
}

function showNoImageMessage() {
  centerOverlay.innerHTML = `
    <div class="finish-message">
      <div class="finish-text">画像ファイルが見つかりません。</div>
      <button id="center-back-btn" type="button" class="center-pick-btn">戻る</button>
    </div>
  `;
  centerOverlay.classList.remove("hidden");
}

function showFinishMessage() {
  centerOverlay.innerHTML = `
    <div class="finish-message">
      <div class="finish-text">
        <img src="end_yumeka.png" alt="" class="finish-image" draggable="false" />
        お疲れ様でした！<br />
        すべての画像を表示しました。<br />
        これにてセッションを終了します。
      </div>
      <button id="center-back-btn" type="button" class="center-pick-btn">戻る</button>
    </div>
  `;
  centerOverlay.classList.remove("hidden");
}

function showFolderPrompt() {
  appendTo(controlParking, settingsControls);
  appendTo(controlParking, controlsPanel);
  centerOverlay.innerHTML = `
    <div class="center-prompt">
      <div>ここにフォルダをドラッグ</div>
      <div class="center-or">または</div>
      <button id="center-pick-btn" type="button" class="center-pick-btn">フォルダ選択</button>
    </div>
  `;
  centerOverlay.classList.remove("hidden");
}

function renderTopicCard() {
  centerOverlay.innerHTML = `
    <div class="topic-card">
      <div class="topic-label">お題</div>
      <button id="topic-value" type="button" class="topic-value">${currentTopic || "フォルダ名"}</button>
      <div id="topic-settings-slot"></div>
      <div id="topic-controls-slot"></div>
    </div>
  `;

  const topicSettingsSlot = document.getElementById("topic-settings-slot");
  const topicControlsSlot = document.getElementById("topic-controls-slot");
  appendTo(topicSettingsSlot, settingsControls);
  appendTo(topicControlsSlot, controlsPanel);
  centerOverlay.classList.remove("hidden");
}

function hideCenterMessage() {
  centerOverlay.classList.add("hidden");
  centerOverlay.textContent = "";
}

function updateRangeLabels() {
  drawSecondsLabel.textContent = formatDuration(Number(drawSecondsInput.value));
  breakSecondsLabel.textContent = formatDuration(Number(breakSecondsInput.value));
}

function updateButtons() {
  const hasImages = sourceImages.length > 0;
  const running = phase !== "idle";
  startBtn.disabled = !hasImages || running;
  pauseBtn.disabled = !running;
  nextBtn.disabled = !running;
  stopBtn.disabled = !running;
  pauseBtn.textContent = isPaused ? "再開" : "一時停止";
}

function updateIndexLabel() {
  if (sessionImages.length === 0 || currentIndex < 0) {
    indexLabel.textContent = "0 / 0";
    return;
  }
  indexLabel.textContent = `${currentIndex + 1} / ${sessionImages.length}`;
}

function renderImage() {
  if (currentIndex < 0 || currentIndex >= sessionImages.length) {
    stageImage.style.display = "none";
    stageImage.removeAttribute("src");
    updateIndexLabel();
    return;
  }
  stageImage.src = sessionImages[currentIndex].url;
  stageImage.style.display = "block";
  updateIndexLabel();
}

function clearTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function releaseSourceUrls() {
  for (const item of sourceImages) {
    URL.revokeObjectURL(item.url);
  }
}

function sortByName(items) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" })
  );
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function moveControlsToTimer() {
  appendTo(timerControlsSlot, controlsPanel);
  appendTo(controlParking, settingsControls);
}

function stopSession(mode = "topic", text = "") {
  clearTimer();
  phase = "idle";
  isPaused = false;
  secondsLeft = 0;
  sessionImages = [];
  currentIndex = -1;
  timerLabel.textContent = "00:00";
  restOverlay.classList.add("hidden");
  renderImage();

  if (mode === "prompt") {
    showFolderPrompt();
  } else if (mode === "finish") {
    appendTo(controlParking, settingsControls);
    appendTo(controlParking, controlsPanel);
    showFinishMessage();
  } else if (mode === "text") {
    appendTo(controlParking, settingsControls);
    appendTo(controlParking, controlsPanel);
    showCenterText(text);
  } else {
    renderTopicCard();
  }
  updateButtons();
}

function enterDrawPhase() {
  phase = "draw";
  isPaused = false;
  secondsLeft = Number(drawSecondsInput.value);
  restOverlay.classList.add("hidden");
  hideCenterMessage();
  moveControlsToTimer();
  timerLabel.textContent = toClock(secondsLeft);
  updateButtons();
}

function enterBreakPhase() {
  phase = "break";
  isPaused = false;
  secondsLeft = Number(breakSecondsInput.value);
  restOverlay.classList.remove("hidden");
  hideCenterMessage();
  moveControlsToTimer();
  timerLabel.textContent = toClock(secondsLeft);
  updateButtons();
}

function finishSession() {
  stopSession("finish");
}

function advanceToNextImage() {
  currentIndex += 1;
  if (currentIndex >= sessionImages.length) {
    finishSession();
    return false;
  }
  renderImage();
  return true;
}

function startTicking() {
  clearTimer();
  timerId = window.setInterval(() => {
    if (isPaused || phase === "idle") return;

    secondsLeft -= 1;
    timerLabel.textContent = toClock(Math.max(secondsLeft, 0));
    if (secondsLeft > 0) return;

    if (phase === "draw") {
      if (currentIndex >= sessionImages.length - 1) {
        finishSession();
        return;
      }
      enterBreakPhase();
      return;
    }

    if (!advanceToNextImage()) return;
    enterDrawPhase();
  }, 1000);
}

function buildSessionQueue() {
  return getOrderMode() === "random" ? shuffle(sourceImages) : sortByName(sourceImages);
}

function startSession() {
  if (sourceImages.length === 0) {
    showFolderPrompt();
    return;
  }
  sessionImages = buildSessionQueue();
  currentIndex = 0;
  renderImage();
  enterDrawPhase();
  startTicking();
}

function nextImage() {
  if (phase === "idle") return;
  if (!advanceToNextImage()) return;
  enterDrawPhase();
}

function togglePause() {
  if (phase === "idle") return;
  isPaused = !isPaused;
  if (isPaused) {
    showCenterText("一時停止中です。");
  } else {
    hideCenterMessage();
  }
  updateButtons();
}

function setSourceImagesFromFiles(files, folderName) {
  const filtered = files.filter((file) => isImageFile(file));
  releaseSourceUrls();
  sourceImages = filtered.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file),
  }));
  currentFolderName = folderName || "フォルダ名";
  currentTopic = currentFolderName;
  sessionImages = [];
  currentIndex = -1;
  renderImage();

  if (sourceImages.length === 0) {
    appendTo(controlParking, settingsControls);
    appendTo(controlParking, controlsPanel);
    showNoImageMessage();
    updateButtons();
    return;
  }
  stopSession("topic");
}

async function pickByDirectoryPicker() {
  const handle = await window.showDirectoryPicker();
  const files = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== "file") continue;
    const file = await entry.getFile();
    files.push(file);
  }
  setSourceImagesFromFiles(files, handle.name || "フォルダ名");
}

function pickByFallback(files) {
  const inferredFolder = files[0]?.webkitRelativePath?.split("/")[0] || "フォルダ名";
  setSourceImagesFromFiles(files, inferredFolder);
}

function openFolderPicker() {
  if (typeof window.showDirectoryPicker === "function") {
    pickByDirectoryPicker().catch(() => showFolderPrompt());
    return;
  }
  folderFallback.click();
}

async function readAllEntries(reader) {
  const out = [];
  while (true) {
    const chunk = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!chunk || chunk.length === 0) break;
    out.push(...chunk);
  }
  return out;
}

async function filesFromEntry(entry, outFiles) {
  if (!entry) return;
  if (entry.isFile) {
    await new Promise((resolve) => {
      entry.file((file) => {
        outFiles.push(file);
        resolve();
      }, resolve);
    });
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    for (const child of children) {
      // eslint-disable-next-line no-await-in-loop
      await filesFromEntry(child, outFiles);
    }
  }
}

async function filesFromHandle(handle, outFiles) {
  if (!handle) return;
  if (handle.kind === "file") {
    const file = await handle.getFile();
    outFiles.push(file);
    return;
  }
  if (handle.kind === "directory") {
    for await (const child of handle.values()) {
      // eslint-disable-next-line no-await-in-loop
      await filesFromHandle(child, outFiles);
    }
  }
}

async function collectDroppedFiles(dataTransfer) {
  const dtItems = Array.from(dataTransfer?.items || []);
  const outFiles = [];
  let folderName = "";
  let isDirectoryDrop = false;

  if (dtItems.length > 0) {
    const handleItems = dtItems.filter(
      (item) => item.kind === "file" && typeof item.getAsFileSystemHandle === "function"
    );
    if (handleItems.length > 0) {
      for (const item of handleItems) {
        // eslint-disable-next-line no-await-in-loop
        const handle = await item.getAsFileSystemHandle();
        if (handle && handle.kind === "directory") {
          isDirectoryDrop = true;
          if (!folderName) folderName = handle.name;
        }
        // eslint-disable-next-line no-await-in-loop
        await filesFromHandle(handle, outFiles);
      }
      return { files: outFiles, folderName, isDirectoryDrop };
    }

    const entries = [];
    for (const item of dtItems) {
      if (item.kind !== "file" || typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      const firstDir = entries.find((entry) => entry.isDirectory);
      if (firstDir) {
        isDirectoryDrop = true;
        folderName = firstDir.name;
      }
      for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop
        await filesFromEntry(entry, outFiles);
      }
      return { files: outFiles, folderName, isDirectoryDrop };
    }
  }

  return { files: Array.from(dataTransfer?.files || []), folderName, isDirectoryDrop };
}

folderFallback.addEventListener("change", (event) => {
  pickByFallback(Array.from(event.target.files || []));
  folderFallback.value = "";
});

centerOverlay.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.id === "center-pick-btn") {
    openFolderPicker();
    return;
  }

  if (target.id === "center-back-btn") {
    if (sourceImages.length === 0) {
      showFolderPrompt();
      return;
    }
    renderTopicCard();
    return;
  }

  if (target.id === "topic-value") {
    const input = document.createElement("input");
    input.id = "topic-input";
    input.className = "topic-input";
    input.type = "text";
    input.maxLength = 120;
    input.value = currentTopic || currentFolderName || "フォルダ名";
    target.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const edited = input.value.trim();
      currentTopic = edited || currentTopic || currentFolderName || "フォルダ名";
      renderTopicCard();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") renderTopicCard();
    });
    input.addEventListener("blur", commit);
  }
});

imageWrap.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  setDragReady(true);
});

imageWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  setDragReady(true);
});

imageWrap.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    setDragReady(false);
  }
});

imageWrap.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  setDragReady(false);
  const result = await collectDroppedFiles(event.dataTransfer);
  const folderName = result.isDirectoryDrop
    ? result.folderName || "フォルダ名"
    : "フォルダ以外が選択されました";
  setSourceImagesFromFiles(result.files, folderName);
});

drawSecondsInput.addEventListener("input", updateRangeLabels);
breakSecondsInput.addEventListener("input", updateRangeLabels);
orderModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (phase === "idle" && sourceImages.length > 0) renderTopicCard();
  });
});

startBtn.addEventListener("click", startSession);
pauseBtn.addEventListener("click", togglePause);
nextBtn.addEventListener("click", nextImage);
stopBtn.addEventListener("click", () => stopSession("topic"));

updateRangeLabels();
updateButtons();
updateIndexLabel();
showFolderPrompt();
