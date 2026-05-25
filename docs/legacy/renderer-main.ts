import "./style.css";

type InputFile = {
  id: string;
  name: string;
  path: string;
  ext: string;
  size: number;
  supported: boolean;
};

type CompressionResult = InputFile & {
  outputPath?: string;
  outputSize?: number;
  ratio?: number;
  status: "done" | "failed";
  error?: string;
};

type CompressionMode = "quality" | "target-size";
type OutputFormat = "original" | "jpg" | "png" | "webp";
type ResizeMode = "stretch" | "crop";
type SaveMode = "source" | "overwrite-source" | "custom";
type ToolKey = "home" | "compress" | "atlas-pack" | "atlas-incremental" | "atlas-unpack";

declare global {
  interface Window {
    simpleImage: {
      pickFiles: () => Promise<InputFile[]>;
      pickFolder: () => Promise<string | null>;
      scanDirectory: (dirPath: string) => Promise<InputFile[]>;
      normalizePaths: (paths: string[]) => Promise<InputFile[]>;
      getPathForFile: (file: File) => string;
      compressImages: (payload: {
        files: InputFile[];
        outputDir: string;
        quality: number;
        mode: CompressionMode;
        targetSizeKB: number;
        outputFormat: OutputFormat;
        saveMode: SaveMode;
        resizeOptions: {
          width?: number;
          height?: number;
          preserveAspect: boolean;
          resizeMode: ResizeMode;
        };
      }) => Promise<CompressionResult[]>;
    };
  }
}

const state = {
  currentTool: "home" as ToolKey,
  files: [] as InputFile[],
  outputDir: "",
  quality: 82,
  targetSizeKB: 300,
  resizeWidth: "",
  resizeHeight: "",
  preserveAspect: true,
  resizeMode: "crop" as ResizeMode,
  mode: "quality" as CompressionMode,
  outputFormat: "original" as OutputFormat,
  saveMode: "source" as SaveMode,
  results: [] as CompressionResult[],
  running: false,
  dropHint: "支持从 Finder 直接拖入 JPG / PNG / GIF / SVG 文件",
  showAdvanced: true,
};

const toolMeta: Record<ToolKey, { label: string; status: string; description: string }> = {
  home: {
    label: "工具首页",
    status: "workspace",
    description: "查看所有图像资产工具与当前阶段规划。",
  },
  compress: {
    label: "图片压缩",
    status: "available",
    description: "当前主功能，替代图压核心流程。",
  },
  "atlas-pack": {
    label: "图集打包",
    status: "planned",
    description: "面向常规图集构建的批处理工具。",
  },
  "atlas-incremental": {
    label: "增量打包",
    status: "planned",
    description: "针对变更资源的增量图集更新能力。",
  },
  "atlas-unpack": {
    label: "图集拆分",
    status: "planned",
    description: "将现有图集恢复为单图资源。",
  },
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

const formatRatio = (ratio?: number) => {
  if (typeof ratio !== "number") return "-";
  return `${(ratio * 100).toFixed(1)}%`;
};

const sumBy = <T>(items: T[], pick: (item: T) => number) => {
  return items.reduce((total, item) => total + pick(item), 0);
};

const getDisplayPath = (file: InputFile | CompressionResult) => {
  return "outputPath" in file && file.outputPath ? file.outputPath : file.path;
};

const getDisplaySize = (file: InputFile | CompressionResult) => {
  return "outputSize" in file && typeof file.outputSize === "number" ? file.outputSize : file.size;
};

const getOriginalSize = (file: InputFile | CompressionResult) => {
  return file.size;
};

const formatPath = (value: string) => {
  if (value.length <= 72) {
    return value;
  }

  return `${value.slice(0, 28)}…${value.slice(-36)}`;
};

const mergeFiles = (incoming: InputFile[]) => {
  const fileMap = new Map(state.files.map((file) => [file.path, file]));
  for (const file of incoming) {
    if (file.supported) {
      fileMap.set(file.path, file);
    }
  }
  state.files = Array.from(fileMap.values()).sort((left, right) => left.name.localeCompare(right.name));
};

const importFiles = async (incoming: InputFile[]) => {
  mergeFiles(incoming);
  state.results = [];
  render();
};

const updateDropHint = (message: string) => {
  state.dropHint = message;
  const hint = document.querySelector<HTMLSpanElement>("#dropzone-hint");
  if (hint) {
    hint.textContent = message;
  }
};

const decodeFileUri = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("file://")) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed.replace("file://", ""));
  } catch {
    return null;
  }
};

const extractDroppedPaths = (event: DragEvent) => {
  const uriList = event.dataTransfer?.getData("text/uri-list") ?? "";
  const fromUriList = uriList
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(decodeFileUri)
    .filter((value): value is string => Boolean(value));

  if (fromUriList.length > 0) {
    return fromUriList;
  }

  return Array.from(event.dataTransfer?.files ?? [])
    .map((file) => {
      const directPath = (file as File & { path?: string }).path;
      if (directPath) {
        return directPath;
      }

      try {
        return window.simpleImage.getPathForFile(file);
      } catch {
        return "";
      }
    })
    .filter((value): value is string => Boolean(value));
};

const handleDrop = async (event: DragEvent) => {
  event.preventDefault();
  const dropzone = event.currentTarget as HTMLDivElement | null;
  dropzone?.classList.remove("active");

  const paths = extractDroppedPaths(event);
  updateDropHint(
    paths.length > 0
      ? `已捕获 ${paths.length} 个拖入文件`
      : "收到了拖拽事件，但没有解析出本地文件路径",
  );

  if (paths.length === 0) {
    return;
  }

  const files = await window.simpleImage.normalizePaths(paths);
  await importFiles(files);
};

const getQualityLevel = () => {
  const normalized = (state.quality - 40) / 55;
  return Math.min(10, Math.max(1, Math.round(normalized * 9 + 1)));
};

const setQualityFromLevel = (level: number) => {
  const nextQuality = Math.round(40 + ((level - 1) / 9) * 55);
  state.quality = Math.max(40, Math.min(95, nextQuality));
};

const clearSession = () => {
  state.files = [];
  state.results = [];
  updateDropHint("支持从 Finder 直接拖入 JPG / PNG / GIF / SVG 文件");
  render();
};

const runCompression = async () => {
  if (state.running || state.files.length === 0 || (state.saveMode === "custom" && !state.outputDir)) {
    return;
  }

  state.running = true;
  render();

  try {
    state.results = await window.simpleImage.compressImages({
      files: state.files,
      outputDir: state.outputDir,
      quality: state.quality,
      mode: state.mode,
      targetSizeKB: state.targetSizeKB,
      outputFormat: state.outputFormat,
      saveMode: state.saveMode,
      resizeOptions: {
        width: Number(state.resizeWidth) || undefined,
        height: Number(state.resizeHeight) || undefined,
        preserveAspect: state.preserveAspect,
        resizeMode: state.resizeMode,
      },
    });
  } finally {
    state.running = false;
    render();
  }
};

const bindDropZone = () => {
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    event.preventDefault();
  });

  const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
  if (!dropzone) {
    return;
  }

  dropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    updateDropHint("检测到拖拽进入，松手即可导入");
    dropzone.classList.add("active");
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  dropzone.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target) {
      dropzone.classList.remove("active");
      updateDropHint("支持从 Finder 直接拖入 JPG / PNG / GIF / SVG 文件");
    }
  });

  dropzone.addEventListener("drop", (event) => {
    void handleDrop(event);
  });
};

const renderToolNav = () => {
  const toolOrder: ToolKey[] = ["home", "compress", "atlas-pack", "atlas-incremental", "atlas-unpack"];

  return `
    <aside class="tool-nav">
      <div class="tool-nav-head">
        <strong>工具集合</strong>
        <span>本地离线工作台</span>
      </div>
      <div class="tool-nav-list">
        ${toolOrder.map((tool) => `
          <button class="tool-nav-item ${state.currentTool === tool ? "is-active" : ""}" data-tool="${tool}">
            <strong>${toolMeta[tool].label}</strong>
            <span>${toolMeta[tool].description}</span>
          </button>
        `).join("")}
      </div>
    </aside>
  `;
};

const renderHomeView = () => {
  const toolOrder: ToolKey[] = ["compress", "atlas-pack", "atlas-incremental", "atlas-unpack"];

  return `
    <section class="tool-home">
      <div class="tool-home-hero">
        <strong>图像资产工具集合</strong>
        <p>当前先交付稳定的图片压缩工具，后续会在同一套本地工作台里继续扩展图集打包、增量打包与图集拆分能力。</p>
      </div>
      <div class="tool-card-grid">
        ${toolOrder.map((tool) => `
          <article class="tool-card ${toolMeta[tool].status === "available" ? "is-available" : ""}">
            <div class="tool-card-head">
              <strong>${toolMeta[tool].label}</strong>
              <em>${toolMeta[tool].status === "available" ? "已可用" : "规划中"}</em>
            </div>
            <p>${toolMeta[tool].description}</p>
            <button class="tool-card-action" data-open-tool="${tool}" ${toolMeta[tool].status === "available" ? "" : "disabled"}>
              ${toolMeta[tool].status === "available" ? "进入工具" : "暂未开放"}
            </button>
          </article>
        `).join("")}
      </div>
      <div class="tool-roadmap">
        <strong>当前建议的演进顺序</strong>
        <ol>
          <li>把图片压缩工具补到稳定可替代。</li>
          <li>抽出通用任务栏、文件导入区、结果列表。</li>
          <li>在同一工作台内接入图集打包与增量打包。</li>
          <li>补图集拆分和发布级流程。</li>
        </ol>
      </div>
    </section>
  `;
};

const renderPlaceholderView = (tool: Exclude<ToolKey, "home" | "compress">) => {
  return `
    <section class="tool-placeholder">
      <strong>${toolMeta[tool].label}</strong>
      <p>${toolMeta[tool].description}</p>
      <div class="placeholder-note">
        <span>当前阶段</span>
        <em>规划中</em>
      </div>
      <ul>
        <li>先完成工具首页与模块边界。</li>
        <li>再抽象通用任务流与文件输入输出能力。</li>
        <li>最后接入该工具的具体资源处理逻辑。</li>
      </ul>
      <button class="tool-card-action" data-open-tool="compress">先回到图片压缩</button>
    </section>
  `;
};

const renderCompressView = () => {
  const totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
  const doneCount = state.results.filter((item) => item.status === "done").length;
  const failedCount = state.results.filter((item) => item.status === "failed").length;
  const succeededResults = state.results.filter((item) => item.status === "done" && typeof item.outputSize === "number");
  const hasFiles = state.files.length > 0;
  const hasResults = state.results.length > 0;
  const totalOriginalSize = sumBy(succeededResults, (item) => item.size);
  const totalOutputSize = sumBy(succeededResults, (item) => item.outputSize ?? 0);
  const savedBytes = Math.max(0, totalOriginalSize - totalOutputSize);
  const savedRatio = totalOriginalSize > 0 ? savedBytes / totalOriginalSize : 0;
  const qualityLevel = getQualityLevel();
  const currentFiles = hasResults ? state.results : state.files;

  return `
    <section class="tool-panel">
      <div class="tool-panel-head">
        <strong>图片压缩</strong>
        <span>当前主工具模块</span>
      </div>
      <div class="tuya-content">
        <section class="stage-panel ${currentFiles.length === 0 ? "stage-panel-empty" : ""}">
          ${currentFiles.length === 0 ? `
            <div id="dropzone" class="dropzone empty-dropzone">
              <div class="drop-illustration" aria-hidden="true"></div>
              <strong>拖入图片开始压缩</strong>
              <span id="dropzone-hint">支持 JPG / PNG / GIF / SVG 格式</span>
            </div>
          ` : `
            <div id="dropzone" class="dropzone filled-dropzone">
              <div class="stage-list">
                ${currentFiles.map((file) => `
                  <article class="stage-row">
                    <div class="stage-main">
                      <strong>${file.name}</strong>
                      <span title="${getDisplayPath(file)}">${formatPath(getDisplayPath(file))}</span>
                    </div>
                    <div class="stage-side">
                      <em>${file.ext.replace(".", "").toUpperCase()}</em>
                      <span class="stage-before">压缩前 ${formatSize(getOriginalSize(file))}</span>
                      ${"outputSize" in file && typeof file.outputSize === "number"
                        ? `<strong class="stage-after">压缩后 ${formatSize(getDisplaySize(file))}</strong>`
                        : `<strong class="stage-after is-pending">压缩后 待压缩</strong>`}
                    </div>
                  </article>
                `).join("")}
              </div>
            </div>
          `}
        </section>

        <section class="action-bar">
          <div class="action-entry">
            <button id="pick-files" class="action-button action-primary">添加图片</button>
            <button id="pick-folder" class="action-button action-secondary">扫描目录</button>
          </div>
          <div class="action-meta">
            <span>${hasFiles ? `${state.files.length} 个文件` : "等待导入"}</span>
            <span>${hasFiles ? formatSize(totalSize) : "支持 JPG / PNG / GIF / SVG"}</span>
          </div>
          <div class="action-group">
            <button id="clear-list" class="ghost-button" ${hasFiles ? "" : "disabled"}>清空列表</button>
            <button id="run" class="ghost-button" ${state.running || state.files.length === 0 || (state.saveMode === "custom" && !state.outputDir) ? "disabled" : ""}>${state.running ? "压缩中..." : "再次压缩"}</button>
          </div>
        </section>

        <section class="settings-grid">
          <div class="settings-card dimensions-card">
            <div class="settings-row">
              <label class="mini-field">
                <span>宽度</span>
                <input id="resize-width" type="number" min="1" step="1" value="${state.resizeWidth}" placeholder="自动" />
              </label>
              <label class="mini-field">
                <span>高度</span>
                <input id="resize-height" type="number" min="1" step="1" value="${state.resizeHeight}" placeholder="自动" />
              </label>
            </div>
            <label class="checkbox-row">
              <input id="preserve-aspect" type="checkbox" ${state.preserveAspect ? "checked" : ""} />
              <span>保持原始宽高比</span>
            </label>
            <div class="resize-mode-row ${state.preserveAspect ? "is-disabled" : ""}">
              <label class="radio-row">
                <input id="resize-stretch" type="radio" name="resize-mode" ${state.resizeMode === "stretch" ? "checked" : ""} ${state.preserveAspect ? "disabled" : ""} />
                <span>拉伸</span>
              </label>
              <label class="radio-row">
                <input id="resize-crop" type="radio" name="resize-mode" ${state.resizeMode === "crop" ? "checked" : ""} ${state.preserveAspect ? "disabled" : ""} />
                <span>裁剪</span>
              </label>
            </div>
          </div>

          <div class="settings-card compression-card">
            <div class="mode-line">
              <label class="radio-row">
                <input id="mode-quality" type="radio" name="mode" ${state.mode === "quality" ? "checked" : ""} />
                <span>压缩强度</span>
              </label>
              <label class="radio-row">
                <input id="mode-target" type="radio" name="mode" ${state.mode === "target-size" ? "checked" : ""} />
                <span>文件大小</span>
              </label>
            </div>
            <div class="slider-wrap ${state.mode === "quality" ? "" : "is-hidden"}">
              <input id="quality-level" type="range" min="1" max="10" value="${qualityLevel}" />
              <div class="slider-scale">${Array.from({ length: 10 }, (_, index) => `<span>${index + 1}</span>`).join("")}</div>
            </div>
            <div class="target-wrap ${state.mode === "target-size" ? "" : "is-hidden"}">
              <label class="target-size-box">
                <span>目标大小</span>
                <div class="target-input">
                  <input id="target-size" type="number" min="10" step="10" value="${state.targetSizeKB}" />
                  <em>KB</em>
                </div>
              </label>
            </div>
          </div>
        </section>

        <section class="advanced-toggle">
          <button id="toggle-advanced" class="toggle-button">${state.showAdvanced ? "收起更多设置" : "展开更多设置"}</button>
        </section>

        <section class="advanced-panel ${state.showAdvanced ? "" : "is-hidden"}">
          <div class="option-block">
            <span class="option-label">目标格式</span>
            <div class="option-list">
              <label class="radio-chip"><input id="format-original" type="radio" name="format" ${state.outputFormat === "original" ? "checked" : ""} /><span>原格式</span></label>
              <label class="radio-chip"><input id="format-webp" type="radio" name="format" ${state.outputFormat === "webp" ? "checked" : ""} ${hasFiles && state.files.some((file) => file.ext === ".gif" || file.ext === ".svg") ? "disabled" : ""} /><span>WebP</span></label>
              <label class="radio-chip"><input id="format-png" type="radio" name="format" ${state.outputFormat === "png" ? "checked" : ""} ${hasFiles && state.files.some((file) => file.ext === ".gif" || file.ext === ".svg") ? "disabled" : ""} /><span>PNG</span></label>
              <label class="radio-chip"><input id="format-jpg" type="radio" name="format" ${state.outputFormat === "jpg" ? "checked" : ""} ${hasFiles && state.files.some((file) => file.ext === ".gif" || file.ext === ".svg") ? "disabled" : ""} /><span>JPG</span></label>
            </div>
          </div>

          <div class="option-block">
            <span class="option-label">保存路径</span>
            <div class="option-list">
              <label class="radio-chip"><input id="save-source" type="radio" name="save" ${state.saveMode === "source" ? "checked" : ""} /><span>原文件夹</span></label>
              <label class="radio-chip"><input id="save-overwrite-source" type="radio" name="save" ${state.saveMode === "overwrite-source" ? "checked" : ""} /><span>覆盖原文件</span></label>
              <label class="radio-chip"><input id="save-custom" type="radio" name="save" ${state.saveMode === "custom" ? "checked" : ""} /><span>自定义文件夹</span></label>
              <button id="pick-output" class="path-button" ${state.saveMode === "custom" ? "" : "disabled"}>${state.outputDir ? formatPath(state.outputDir) : "选择文件夹"}</button>
            </div>
          </div>
        </section>

        ${hasResults ? `
          <section class="summary-banner">
            <span>成功 ${doneCount}</span>
            <span>失败 ${failedCount}</span>
            <span>原始 ${formatSize(totalOriginalSize)}</span>
            <span>输出 ${formatSize(totalOutputSize)}</span>
            <strong>本轮节省 ${formatSize(savedBytes)} · ${formatRatio(savedRatio)}</strong>
          </section>
        ` : ""}
      </div>
    </section>
  `;
};

const render = () => {
  const content = state.currentTool === "home"
    ? renderHomeView()
    : state.currentTool === "compress"
      ? renderCompressView()
      : renderPlaceholderView(state.currentTool);

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main class="tuya-shell">
      <header class="tuya-titlebar">
        <strong>SimpleImageCompress</strong>
      </header>
      <div class="workspace-shell">
        ${renderToolNav()}
        <section class="workspace-main">
          ${content}
        </section>
      </div>
    </main>
  `;

  bindEvents();
  bindDropZone();
};

const bindEvents = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTool = button.dataset.tool as ToolKey | undefined;
      if (!nextTool || nextTool === state.currentTool) {
        return;
      }
      state.currentTool = nextTool;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-open-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTool = button.dataset.openTool as ToolKey | undefined;
      if (!nextTool) {
        return;
      }
      state.currentTool = nextTool;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#pick-files")?.addEventListener("click", async () => {
    await importFiles((await window.simpleImage.pickFiles()).filter((file) => file.supported));
  });

  document.querySelector<HTMLButtonElement>("#empty-pick-files")?.addEventListener("click", async () => {
    await importFiles((await window.simpleImage.pickFiles()).filter((file) => file.supported));
  });

  document.querySelector<HTMLButtonElement>("#pick-folder")?.addEventListener("click", async () => {
    const inputDir = await window.simpleImage.pickFolder();
    if (!inputDir) {
      return;
    }
    await importFiles(await window.simpleImage.scanDirectory(inputDir));
  });

  document.querySelector<HTMLButtonElement>("#empty-pick-folder")?.addEventListener("click", async () => {
    const inputDir = await window.simpleImage.pickFolder();
    if (!inputDir) {
      return;
    }
    await importFiles(await window.simpleImage.scanDirectory(inputDir));
  });

  document.querySelector<HTMLButtonElement>("#pick-output")?.addEventListener("click", async () => {
    state.outputDir = (await window.simpleImage.pickFolder()) || state.outputDir;
    render();
  });

  document.querySelector<HTMLInputElement>("#mode-quality")?.addEventListener("change", () => {
    state.mode = "quality";
    render();
  });

  document.querySelector<HTMLInputElement>("#mode-target")?.addEventListener("change", () => {
    state.mode = "target-size";
    render();
  });

  document.querySelector<HTMLInputElement>("#quality-level")?.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    setQualityFromLevel(Number(target.value));
  });

  document.querySelector<HTMLInputElement>("#target-size")?.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.targetSizeKB = Math.max(10, Number(target.value) || 10);
  });

  document.querySelector<HTMLInputElement>("#resize-width")?.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.resizeWidth = target.value;
  });

  document.querySelector<HTMLInputElement>("#resize-height")?.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.resizeHeight = target.value;
  });

  document.querySelector<HTMLInputElement>("#preserve-aspect")?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    state.preserveAspect = target.checked;
    render();
  });

  document.querySelector<HTMLInputElement>("#resize-stretch")?.addEventListener("change", () => {
    state.resizeMode = "stretch";
  });

  document.querySelector<HTMLInputElement>("#resize-crop")?.addEventListener("change", () => {
    state.resizeMode = "crop";
  });

  document.querySelector<HTMLInputElement>("#format-original")?.addEventListener("change", () => {
    state.outputFormat = "original";
  });
  document.querySelector<HTMLInputElement>("#format-webp")?.addEventListener("change", () => {
    state.outputFormat = "webp";
  });
  document.querySelector<HTMLInputElement>("#format-png")?.addEventListener("change", () => {
    state.outputFormat = "png";
  });
  document.querySelector<HTMLInputElement>("#format-jpg")?.addEventListener("change", () => {
    state.outputFormat = "jpg";
  });

  document.querySelector<HTMLInputElement>("#save-source")?.addEventListener("change", () => {
    state.saveMode = "source";
  });

  document.querySelector<HTMLInputElement>("#save-overwrite-source")?.addEventListener("change", () => {
    state.saveMode = "overwrite-source";
  });

  document.querySelector<HTMLInputElement>("#save-custom")?.addEventListener("change", () => {
    state.saveMode = "custom";
  });

  document.querySelector<HTMLButtonElement>("#toggle-advanced")?.addEventListener("click", () => {
    state.showAdvanced = !state.showAdvanced;
    render();
  });

  document.querySelector<HTMLButtonElement>("#clear-list")?.addEventListener("click", () => {
    clearSession();
  });

  document.querySelector<HTMLButtonElement>("#run")?.addEventListener("click", async () => {
    await runCompression();
  });
};

render();
