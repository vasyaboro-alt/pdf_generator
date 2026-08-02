const STORAGE_KEY = "pdf-guide-creator-v1";

const TYPE_LABELS = {
  heading: "Заголовок H1",
  subheading: "Заголовок H2",
  paragraph: "Абзац",
  step: "Шаг",
  image: "Изображение",
  highlight: "Выделение",
  info: "Инфо-блок",
  divider: "Разделитель",
};

const state = {
  title: "Как создавать\nPDF гайды",
  subtitle: "Пошаговая инструкция",
  meta: "",
  logoCover: null,
  logoHeader: null,
  coverImage: null,
  coverBg: "#0a0a1a",
  logoPlate: true,
  blocks: [
    {
      id: uid(),
      type: "heading",
      text: "Введение",
    },
    {
      id: uid(),
      type: "paragraph",
      text: "В этом гайде вы пошагово разберёте создание PDF: обложка, логотипы в колонтитулах и вставка изображений.",
    },
    {
      id: uid(),
      type: "step",
      number: "1",
      title: "Подготовьте материалы",
      text: "Загрузите фон обложки, логотипы и нужные скриншоты. Текст можно вставить целиком из файла.",
    },
  ],
};

const els = {};

function uid() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function $(sel) {
  return document.querySelector(sel);
}

function toast(message) {
  const node = els.toast;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    node.hidden = true;
  }, 2400);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Сжимает картинку — без этого PDF генерируется очень долго. */
function compressImage(dataUrl, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1600,
    quality = 0.82,
    mime = "image/jpeg",
    keepAlpha = false,
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!keepAlpha && mime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const outMime = keepAlpha ? "image/png" : mime;
        const out = canvas.toDataURL(outMime, keepAlpha ? undefined : quality);
        resolve(out);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const UPLOAD_LIMITS = {
  logoCover: { maxWidth: 440, maxHeight: 140, keepAlpha: true, mime: "image/png" },
  logoHeader: { maxWidth: 360, maxHeight: 90, keepAlpha: true, mime: "image/png" },
  coverImage: { maxWidth: 1400, maxHeight: 2000, quality: 0.8, mime: "image/jpeg" },
  contentImage: { maxWidth: 1100, maxHeight: 1400, quality: 0.8, mime: "image/jpeg" },
};

function getDominantColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const counts = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        let best = "10,10,26";
        let max = 0;
        for (const [key, n] of counts) {
          if (n > max) {
            max = n;
            best = key;
          }
        }
        const [r, g, b] = best.split(",").map(Number);
        resolve(
          `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
            .toString(16)
            .padStart(2, "0")}`
        );
      } catch {
        resolve("#0a0a1a");
      }
    };
    img.onerror = () => resolve("#0a0a1a");
    img.src = dataUrl;
  });
}

function saveState() {
  const payload = {
    title: state.title,
    subtitle: state.subtitle,
    meta: state.meta,
    logoCover: state.logoCover,
    logoHeader: state.logoHeader,
    coverImage: state.coverImage,
    coverBg: state.coverBg,
    logoPlate: state.logoPlate !== false,
    blocks: state.blocks,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    if (!Array.isArray(state.blocks) || state.blocks.length === 0) {
      state.blocks = [
        { id: uid(), type: "heading", text: "Введение" },
        {
          id: uid(),
          type: "paragraph",
          text: "Добавьте блоки содержания справа и экспортируйте PDF.",
        },
      ];
    }
  } catch {
    /* ignore */
  }
}

/** Пересжимает уже сохранённые тяжёлые картинки (из старых сессий). */
async function recompressStoredImages() {
  const tasks = [];

  if (state.logoCover) {
    tasks.push(
      compressImage(state.logoCover, UPLOAD_LIMITS.logoCover).then((v) => {
        state.logoCover = v;
      })
    );
  }
  if (state.logoHeader) {
    tasks.push(
      compressImage(state.logoHeader, UPLOAD_LIMITS.logoHeader).then((v) => {
        state.logoHeader = v;
      })
    );
  }
  if (state.coverImage) {
    tasks.push(
      compressImage(state.coverImage, UPLOAD_LIMITS.coverImage).then((v) => {
        state.coverImage = v;
      })
    );
  }

  for (const block of state.blocks) {
    if (block.type === "image" && block.src) {
      tasks.push(
        compressImage(block.src, UPLOAD_LIMITS.contentImage).then((v) => {
          block.src = v;
        })
      );
    }
  }

  if (tasks.length) {
    await Promise.all(tasks);
    saveState();
  }
}

function setUploadPreview(key, dataUrl) {
  const preview = $(`#preview-${key}`);
  const clearBtn = $(`#clear-${key}`);
  if (!preview) return;
  if (dataUrl) {
    preview.innerHTML = `<img src="${dataUrl}" alt="" />`;
    if (clearBtn) clearBtn.hidden = false;
  } else {
    preview.innerHTML = "";
    if (clearBtn) clearBtn.hidden = true;
  }
}

async function handleImageFile(key, file) {
  if (!file) return;
  try {
    const raw = await fileToDataUrl(file);
    const limits = UPLOAD_LIMITS[key] || UPLOAD_LIMITS.contentImage;
    const dataUrl = await compressImage(raw, limits);
    state[key] = dataUrl;
    if (key === "coverImage") {
      state.coverBg = await getDominantColor(dataUrl);
    }
    setUploadPreview(key, dataUrl);
    persistAndRender();
    toast(key === "coverImage" ? "Фон обложки загружен" : "Логотип загружен");
  } catch (err) {
    console.error(err);
    toast("Не удалось загрузить файл");
  }
}

function clearImage(key) {
  state[key] = null;
  if (key === "coverImage") state.coverBg = "#0a0a1a";
  setUploadPreview(key, null);
  persistAndRender();
}

function bindUploads() {
  ["coverImage", "logoCover", "logoHeader"].forEach((key) => {
    const input = $(`#input-${key}`);
    const clearBtn = $(`#clear-${key}`);
    if (input) {
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        await handleImageFile(key, file);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => clearImage(key));
    }
  });

  const logoPlate = $("#logo-plate");
  if (logoPlate) {
    logoPlate.checked = state.logoPlate !== false;
    logoPlate.addEventListener("change", () => {
      state.logoPlate = logoPlate.checked;
      saveState();
      renderPreview();
    });
  }
}

/** Разбирает текст в блоки гайда. */
function parseTextToBlocks(raw) {
  let text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Если нет пустых строк между абзацами — делим по одиночным переносам
  if (!/\n\s*\n/.test(text) && text.includes("\n")) {
    text = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  const blocks = [];
  const chunks = text.split(/\n\s*\n/);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trimEnd());
    const first = (lines[0] || "").trim();
    if (!first) continue;

    if (/^#\s+/.test(first) && !/^##/.test(first)) {
      blocks.push({
        id: uid(),
        type: "heading",
        text: first.replace(/^#\s+/, "").trim(),
      });
      const rest = lines.slice(1).join("\n").trim();
      if (rest) blocks.push({ id: uid(), type: "paragraph", text: rest });
      continue;
    }

    if (/^##\s+/.test(first)) {
      blocks.push({
        id: uid(),
        type: "subheading",
        text: first.replace(/^##\s+/, "").trim(),
      });
      const rest = lines.slice(1).join("\n").trim();
      if (rest) blocks.push({ id: uid(), type: "paragraph", text: rest });
      continue;
    }

    if (/^###\s+/.test(first) || /^шаг\s*\d+/i.test(first)) {
      const title = first.replace(/^###\s+/, "").trim();
      const rest = lines.slice(1).join("\n").trim();
      const numMatch = title.match(/(\d+)/);
      blocks.push({
        id: uid(),
        type: "step",
        number: numMatch ? numMatch[1] : String(blocks.filter((b) => b.type === "step").length + 1),
        title,
        text: rest || title,
      });
      continue;
    }

    blocks.push({ id: uid(), type: "paragraph", text: lines.join("\n").trim() });
  }

  return blocks;
}

function applyBulkText(options = {}) {
  const { silent = false } = options;
  const raw = els.bulkText?.value || "";
  const parsed = parseTextToBlocks(raw);
  const status = $("#text-status");

  if (!parsed.length) {
    if (!silent) toast("Вставьте текст в поле выше");
    if (status) status.textContent = "Поле пустое — вставьте текст (Ctrl+V).";
    return false;
  }

  const replace = $("#text-replace")?.checked !== false;
  state.blocks = replace ? parsed : state.blocks.concat(parsed);
  persistAndRender();

  if (status) {
    status.textContent = `В превью: ${parsed.length} блок(ов). Можно править блоки ниже в разделе 4.`;
  }
  if (!silent) toast("Текст отображается в превью");
  return true;
}

function scheduleBulkTextApply() {
  clearTimeout(scheduleBulkTextApply._t);
  scheduleBulkTextApply._t = setTimeout(() => {
    applyBulkText({ silent: true });
  }, 350);
}

async function importTextFile(file) {
  if (!file) return;
  const text = await file.text();
  els.bulkText.value = text;
  applyBulkText();
}

async function importMultipleImages(files) {
  const list = [...files];
  if (!list.length) return;
  for (const file of list) {
    const raw = await fileToDataUrl(file);
    const src = await compressImage(raw, UPLOAD_LIMITS.contentImage);
    state.blocks.push({
      id: uid(),
      type: "image",
      src,
      caption: file.name.replace(/\.[^.]+$/, ""),
    });
  }
  persistAndRender();
  toast(`Добавлено изображений: ${list.length}`);
}

function createBlock(type) {
  const id = uid();
  switch (type) {
    case "heading":
      return { id, type, text: "Новый раздел" };
    case "subheading":
      return { id, type, text: "Подраздел" };
    case "paragraph":
      return { id, type, text: "Текст абзаца…" };
    case "step":
      return {
        id,
        type,
        number: String(state.blocks.filter((b) => b.type === "step").length + 1),
        title: "Название шага",
        text: "Описание шага…",
      };
    case "image":
      return { id, type, src: null, caption: "" };
    case "highlight":
      return { id, type, text: "Важный акцент" };
    case "info":
      return { id, type, text: "Полезная заметка" };
    case "divider":
      return { id, type, text: "● ● ●" };
    default:
      return { id, type: "paragraph", text: "" };
  }
}

function moveBlock(id, dir) {
  const i = state.blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= state.blocks.length) return;
  const [item] = state.blocks.splice(i, 1);
  state.blocks.splice(j, 0, item);
  persistAndRender();
}

function removeBlock(id) {
  state.blocks = state.blocks.filter((b) => b.id !== id);
  persistAndRender();
}

function clearParagraphBlocks() {
  const before = state.blocks.length;
  state.blocks = state.blocks.filter((b) => b.type !== "paragraph");
  const removed = before - state.blocks.length;
  if (!removed) {
    toast("Абзацев нет");
    return;
  }
  persistAndRender();
  toast(`Удалено абзацев: ${removed}`);
}

function renderBlocksEditor() {
  const list = els.blocksList;
  list.innerHTML = "";

  state.blocks.forEach((block, index) => {
    const card = document.createElement("div");
    card.className = "block-card";
    card.dataset.id = block.id;

    const head = document.createElement("div");
    head.className = "block-card-head";
    head.innerHTML = `
      <span class="block-type">${TYPE_LABELS[block.type] || block.type}</span>
      <div class="block-card-actions">
        <button type="button" class="icon-btn" data-act="up" title="Выше">↑</button>
        <button type="button" class="icon-btn" data-act="down" title="Ниже">↓</button>
        <button type="button" class="icon-btn" data-act="remove" title="Удалить">×</button>
      </div>
    `;
    card.appendChild(head);

    if (block.type === "step") {
      card.appendChild(fieldInput("Номер", "number", block.number, (v) => (block.number = v)));
      card.appendChild(fieldInput("Заголовок шага", "title", block.title, (v) => (block.title = v)));
      card.appendChild(fieldTextarea("Текст", "text", block.text, (v) => (block.text = v)));
    } else if (block.type === "image") {
      const row = document.createElement("div");
      row.className = "block-image-row";
      const thumb = document.createElement("div");
      thumb.className = "block-image-thumb";
      if (block.src) thumb.innerHTML = `<img src="${block.src}" alt="" />`;
      const controls = document.createElement("div");
      controls.style.flex = "1";
      controls.style.display = "flex";
      controls.style.flexDirection = "column";
      controls.style.gap = "0.5rem";

      const fileLabel = document.createElement("label");
      fileLabel.className = "btn btn-secondary btn-file";
      fileLabel.style.textAlign = "center";
      fileLabel.append(
        document.createTextNode(block.src ? "Заменить изображение" : "Загрузить изображение")
      );
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileLabel.appendChild(fileInput);
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        try {
          const raw = await fileToDataUrl(file);
          block.src = await compressImage(raw, UPLOAD_LIMITS.contentImage);
          persistAndRender();
          toast("Изображение загружено");
        } catch (err) {
          console.error(err);
          toast("Не удалось загрузить изображение");
        }
      });

      const caption = fieldInput("Подпись", "caption", block.caption || "", (v) => {
        block.caption = v;
      });
      controls.append(fileLabel, caption);
      row.append(thumb, controls);
      card.appendChild(row);
    } else if (block.type === "divider") {
      card.appendChild(fieldInput("Символы", "text", block.text, (v) => (block.text = v)));
    } else {
      const label =
        block.type === "heading" || block.type === "subheading"
          ? "Текст заголовка"
          : "Текст";
      card.appendChild(fieldTextarea(label, "text", block.text, (v) => (block.text = v)));
    }

    head.querySelector('[data-act="up"]').addEventListener("click", () => moveBlock(block.id, -1));
    head.querySelector('[data-act="down"]').addEventListener("click", () => moveBlock(block.id, 1));
    head.querySelector('[data-act="remove"]').addEventListener("click", () => removeBlock(block.id));

    if (index === 0) head.querySelector('[data-act="up"]').disabled = true;
    if (index === state.blocks.length - 1) head.querySelector('[data-act="down"]').disabled = true;

    list.appendChild(card);
  });
}

function fieldInput(label, name, value, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  wrap.innerHTML = `<span>${label}</span>`;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.addEventListener("input", () => {
    onChange(input.value);
    saveState();
    renderPreview();
  });
  wrap.appendChild(input);
  return wrap;
}

function fieldTextarea(label, name, value, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  wrap.innerHTML = `<span>${label}</span>`;
  const input = document.createElement("textarea");
  input.rows = 3;
  input.value = value ?? "";
  input.addEventListener("input", () => {
    onChange(input.value);
    saveState();
    renderPreview();
  });
  wrap.appendChild(input);
  return wrap;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Безопасный HTML с базовым Markdown:
 * *курсив*, _курсив_, **жирный**, __жирный__, ***оба***, `код`
 */
function formatRichText(str) {
  let s = escapeHtml(str);

  const slots = [];
  const park = (html) => {
    const i = slots.length;
    slots.push(html);
    return `\u0000${i}\u0000`;
  };

  // Инлайн-код — не трогаем разметкой внутри
  s = s.replace(/`([^`\n]+)`/g, (_, code) => park(`<code>${code}</code>`));

  // ***жирный курсив*** / ___…___
  s = s.replace(/\*\*\*([^*\n]+?)\*\*\*/g, (_, t) => park(`<strong><em>${t}</em></strong>`));
  s = s.replace(/___([^_\n]+?)___/g, (_, t) => park(`<strong><em>${t}</em></strong>`));

  // **жирный** / __жирный__
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, (_, t) => park(`<strong>${t}</strong>`));
  s = s.replace(/__([^_\n]+?)__/g, (_, t) => park(`<strong>${t}</strong>`));

  // *курсив* / _курсив_ (не трогаем одиночные * вроде 2*3)
  s = s.replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\*)/g, (_, pre, t) => `${pre}${park(`<em>${t}</em>`)}`);
  s = s.replace(/(^|[^\w_])_([^_\n]+?)_(?!_)/g, (_, pre, t) => `${pre}${park(`<em>${t}</em>`)}`);

  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)] || "");
  return s.replaceAll("\n", "<br>");
}

function nl2br(str) {
  return formatRichText(str);
}

function blockToHtml(block) {
  switch (block.type) {
    case "heading":
      return `<h1>${formatRichText(block.text)}</h1>`;
    case "subheading":
      return `<h2>${formatRichText(block.text)}</h2>`;
    case "paragraph":
      return `<p>${formatRichText(block.text)}</p>`;
    case "step":
      return `<div class="guide-step">
        <div class="guide-step-title">
          <span class="guide-step-number">${escapeHtml(block.number || "")}</span>
          ${formatRichText(block.title || "")}
        </div>
        <p>${formatRichText(block.text)}</p>
      </div>`;
    case "image":
      if (!block.src) {
        return `<div class="guide-image"><p style="color:#444;text-align:center;font-weight:500">[Изображение не загружено]</p></div>`;
      }
      return `<figure class="guide-image">
        <img src="${block.src}" alt="${escapeHtml(block.caption || "")}" />
        ${block.caption ? `<figcaption>${formatRichText(block.caption)}</figcaption>` : ""}
      </figure>`;
    case "highlight":
      return `<div class="guide-highlight">${formatRichText(block.text)}</div>`;
    case "info":
      return `<div class="guide-info">${formatRichText(block.text)}</div>`;
    case "divider":
      return `<div class="guide-divider">${escapeHtml(block.text || "● ● ●")}</div>`;
    case "meta":
      return `<div class="guide-meta">${formatRichText(block.text)}</div>`;
    default:
      return "";
  }
}

function htmlToElement(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function bodyOverflows(body) {
  return body.scrollHeight > body.clientHeight + 1;
}

function waitForImages(root) {
  const images = [...root.querySelectorAll("img")];
  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 2500);
        })
    )
  );
}

function createContentPage(headerHtml) {
  const page = document.createElement("section");
  page.className = "guide-page guide-content-page";
  page.innerHTML = `
    ${headerHtml}
    <div class="guide-body"></div>
    <div class="guide-footer"></div>
  `;
  return page;
}

/** Сколько текста помещается в оставшееся место страницы. */
function fitPlainText(body, text) {
  const p = document.createElement("p");
  body.appendChild(p);

  const tokens = String(text).split(/(\s+)/);
  if (!tokens.length) {
    p.remove();
    return { node: null, rest: "" };
  }

  let lo = 0;
  let hi = tokens.length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    p.innerHTML = formatRichText(tokens.slice(0, mid).join(""));
    if (!bodyOverflows(body)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === 0) {
    p.remove();
    return { node: null, rest: text };
  }

  const fitted = tokens.slice(0, best).join("").replace(/\s+$/, "");
  const rest = tokens.slice(best).join("").replace(/^\s+/, "");
  p.innerHTML = formatRichText(fitted);
  return { node: p, rest };
}

async function paginateBlocks(root, headerHtml, blocks) {
  const pages = [];
  let page = createContentPage(headerHtml);
  root.appendChild(page);
  pages.push(page);
  let body = page.querySelector(".guide-body");

  const startNewPage = () => {
    page = createContentPage(headerHtml);
    root.appendChild(page);
    pages.push(page);
    body = page.querySelector(".guide-body");
  };

  const placeAtomic = async (el) => {
    body.appendChild(el);
    await waitForImages(el);

    if (!bodyOverflows(body)) return;

    body.removeChild(el);

    // Страница пустая, а блок всё равно не влезает — принудительно
    if (!body.children.length) {
      body.appendChild(el);
      await waitForImages(el);
      // Поджать картинку под высоту страницы
      const img = el.querySelector("img");
      if (img && bodyOverflows(body)) {
        const max = Math.max(80, body.clientHeight - 40);
        img.style.maxHeight = `${max}px`;
      }
      return;
    }

    startNewPage();
    body.appendChild(el);
    await waitForImages(el);

    if (bodyOverflows(body)) {
      const img = el.querySelector("img");
      if (img) {
        const max = Math.max(80, body.clientHeight - 40);
        img.style.maxHeight = `${max}px`;
      }
    }
  };

  const placeParagraphText = (text) => {
    let rest = String(text || "");
    while (rest) {
      const { node, rest: next } = fitPlainText(body, rest);
      if (!node) {
        if (!body.children.length) {
          // даже одно слово не влезает — форсируем кусок
          const p = document.createElement("p");
          const words = rest.split(/(\s+)/);
          p.innerHTML = formatRichText(words.slice(0, Math.min(12, words.length)).join(""));
          body.appendChild(p);
          rest = words.slice(Math.min(12, words.length)).join("").trim();
          if (rest) startNewPage();
          continue;
        }
        startNewPage();
        continue;
      }
      rest = next;
      if (rest) startNewPage();
    }
  };

  for (const block of blocks) {
    if (block.type === "paragraph") {
      placeParagraphText(block.text);
      continue;
    }

    // Длинные текстовые блоки (highlight/info) тоже переносим по словам при необходимости
    if ((block.type === "highlight" || block.type === "info") && String(block.text || "").length > 400) {
      const shell = htmlToElement(
        block.type === "highlight"
          ? `<div class="guide-highlight"></div>`
          : `<div class="guide-info"></div>`
      );
      // упрощённо: атомарно, если не влез — на новую страницу
      shell.innerHTML = nl2br(block.text);
      await placeAtomic(shell);
      continue;
    }

    const html = blockToHtml(block);
    if (!html) continue;
    const el = htmlToElement(html);
    await placeAtomic(el);
  }

  // Нумерация: обложка = стр.1, содержание со 2-й
  const total = pages.length + 1;
  pages.forEach((p, i) => {
    const footer = p.querySelector(".guide-footer");
    if (footer) footer.textContent = `Страница ${i + 2} из ${total}`;
  });

  return pages;
}

function renderPreview() {
  const root = els.guideRoot;
  if (!root) return Promise.resolve();

  const titleHtml = escapeHtml(state.title);
  const coverImg = state.coverImage
    ? `<div class="guide-cover-bg"><img src="${state.coverImage}" alt="" /></div>`
    : `<div class="guide-cover-bg" style="background:${state.coverBg}"></div>`;

  const plateClass = state.logoPlate !== false ? " has-plate" : "";
  const coverLogo = state.logoCover
    ? `<div class="guide-cover-logo-wrap${plateClass}"><img class="guide-cover-logo" src="${state.logoCover}" alt="Logo" /></div>`
    : "";

  const headerHtml = state.logoHeader
    ? `<div class="guide-header"><img src="${state.logoHeader}" alt="Header logo" /></div>`
    : `<div class="guide-header"></div>`;

  const emptyCoverHint =
    !state.coverImage && !state.logoCover
      ? `<p class="guide-cover-subtitle" style="opacity:.75">Загрузите фон обложки и логотип слева</p>`
      : "";

  root.innerHTML = `
    <section class="guide-page guide-cover" style="background-color:${state.coverBg}">
      ${coverImg}
      ${coverLogo}
      <div class="guide-cover-content">
        <h1 class="guide-cover-title">${titleHtml}</h1>
        ${state.subtitle ? `<p class="guide-cover-subtitle">${escapeHtml(state.subtitle)}</p>` : ""}
        ${emptyCoverHint}
      </div>
    </section>
  `;

  const contentBlocks = [...state.blocks];
  if (state.meta) {
    contentBlocks.push({ id: "meta", type: "meta", text: state.meta });
  }

  const token = (renderPreview._token || 0) + 1;
  renderPreview._token = token;

  return paginateBlocks(root, headerHtml, contentBlocks).then((pages) => {
    if (renderPreview._token !== token) return [];
    return pages;
  });
}

function persistAndRender() {
  saveState();
  renderBlocksEditor();
  renderPreview();
}

function syncFormFromState() {
  els.title.value = state.title;
  els.subtitle.value = state.subtitle;
  els.meta.value = state.meta || "";
  setUploadPreview("logoCover", state.logoCover);
  setUploadPreview("logoHeader", state.logoHeader);
  setUploadPreview("coverImage", state.coverImage);
  const logoPlate = $("#logo-plate");
  if (logoPlate) logoPlate.checked = state.logoPlate !== false;
}

function bindForm() {
  els.title.addEventListener("input", () => {
    state.title = els.title.value;
    saveState();
    renderPreview();
  });
  els.subtitle.addEventListener("input", () => {
    state.subtitle = els.subtitle.value;
    saveState();
    renderPreview();
  });
  els.meta.addEventListener("input", () => {
    state.meta = els.meta.value;
    saveState();
    renderPreview();
  });

  els.addBlock.addEventListener("click", () => {
    const type = els.addType.value;
    state.blocks.push(createBlock(type));
    persistAndRender();
    toast("Блок добавлен");
  });

  $("#btn-add-image")?.addEventListener("click", () => {
    state.blocks.push(createBlock("image"));
    persistAndRender();
    toast("Добавьте картинку в новый блок");
  });
  $("#btn-add-paragraph")?.addEventListener("click", () => {
    state.blocks.push(createBlock("paragraph"));
    persistAndRender();
  });
  $("#btn-clear-paragraphs")?.addEventListener("click", () => clearParagraphBlocks());
  $("#btn-add-step")?.addEventListener("click", () => {
    state.blocks.push(createBlock("step"));
    persistAndRender();
  });

  $("#btn-apply-text")?.addEventListener("click", () => applyBulkText());
  $("#input-text-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    try {
      await importTextFile(file);
    } catch (err) {
      console.error(err);
      toast("Не удалось прочитать текстовый файл");
    }
  });
  $("#input-multi-images")?.addEventListener("change", async (e) => {
    const files = e.target.files;
    e.target.value = "";
    try {
      await importMultipleImages(files);
    } catch (err) {
      console.error(err);
      toast("Не удалось загрузить изображения");
    }
  });

  // Вставка/набор текста сразу обновляет превью
  if (els.bulkText) {
    els.bulkText.addEventListener("paste", () => {
      setTimeout(() => applyBulkText({ silent: true }), 0);
    });
    els.bulkText.addEventListener("input", () => scheduleBulkTextApply());
  }

  els.clear.addEventListener("click", () => {
    if (!confirm("Сбросить гайд к начальному состоянию?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  els.previewToggle.addEventListener("click", () => {
    els.previewPanel.classList.toggle("is-hidden-mobile");
  });

  els.exportBtn.addEventListener("click", () => openSaveChoice());
  els.printBtn.addEventListener("click", () => printPdf());
  els.cancelExport.addEventListener("click", () => cancelExport());

  $("#btn-save-download")?.addEventListener("click", () => {
    closeSaveChoice();
    exportPdf({ destination: "download" });
  });
  $("#btn-save-drive")?.addEventListener("click", () => {
    closeSaveChoice();
    exportPdf({ destination: "drive" });
  });
  $("#btn-save-cancel")?.addEventListener("click", () => closeSaveChoice());
  els.saveChoiceOverlay?.addEventListener("click", (e) => {
    if (e.target === els.saveChoiceOverlay) closeSaveChoice();
  });
}

function safeFilename(title) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const raw = String(title || "guide").replaceAll("\n", " ").trim().toLowerCase();
  let latin = "";
  for (const ch of raw) {
    if (map[ch] != null) latin += map[ch];
    else if (/[a-z0-9]+/.test(ch)) latin += ch;
    else if (/\s|-|_/.test(ch)) latin += "-";
  }
  latin = latin.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `${latin || "pdf-guide"}.pdf`;
}

/** Имя файла для Google Drive — можно с кириллицей. */
function displayFilename(title) {
  const raw = String(title || "Гайд")
    .replaceAll("\n", " ")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const name = raw || "Гайд";
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

const DRIVE_CLIENT_KEY = "pdf-guide-google-client-id";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function getGoogleClientId() {
  const fromConfig = window.PDF_GUIDE_CONFIG?.googleClientId?.trim();
  if (fromConfig) return fromConfig;
  try {
    return (localStorage.getItem(DRIVE_CLIENT_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setGoogleClientId(id) {
  try {
    localStorage.setItem(DRIVE_CLIENT_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

function ensureGoogleClientId() {
  let id = getGoogleClientId();
  if (id) return id;

  const entered = window.prompt(
    "Для отправки на Google Drive нужен OAuth Client ID.\n\n" +
      "1) console.cloud.google.com → создать OAuth Client (Web)\n" +
      "2) В Origins добавить http://127.0.0.1:8765\n" +
      "3) Включить Google Drive API\n\n" +
      "Вставьте Client ID:",
    ""
  );
  if (!entered || !entered.trim()) return "";
  id = entered.trim();
  setGoogleClientId(id);
  return id;
}

function waitForGoogleIdentity(timeoutMs = 12000) {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error("Библиотека Google Identity не загрузилась"));
      }
    }, 100);
  });
}

function requestGoogleAccessToken(clientId) {
  return waitForGoogleIdentity().then(
    () =>
      new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: (resp) => {
            if (resp && resp.access_token) resolve(resp.access_token);
            else reject(new Error(resp?.error || "Не удалось получить доступ к Google"));
          },
          error_callback: (err) => {
            reject(new Error(err?.message || "Авторизация Google отменена"));
          },
        });
        tokenClient.requestAccessToken({ prompt: "" });
      })
  );
}

async function uploadPdfToDrive(blob, filename, accessToken) {
  const metadata = {
    name: filename,
    mimeType: "application/pdf",
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", blob, filename);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive API: ${res.status} ${detail.slice(0, 180)}`);
  }

  return res.json();
}

function pdfToBlob(pdf) {
  const ab = pdf.output("arraybuffer");
  if (!isValidPdfBuffer(ab)) {
    throw new Error("PDF повреждён при создании");
  }
  return new Blob([ab], { type: "application/pdf" });
}

function openSaveChoice() {
  if (exportPdf.busy) return;
  els.saveChoiceOverlay?.classList.add("is-open");
  els.saveChoiceOverlay?.setAttribute("aria-hidden", "false");
}

function closeSaveChoice() {
  els.saveChoiceOverlay?.classList.remove("is-open");
  els.saveChoiceOverlay?.setAttribute("aria-hidden", "true");
}

function isValidPdfBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

/** Сохраняет настоящий PDF на диск (не «документ Chrome»). */
async function downloadPdfDocument(pdf, filename) {
  const ab = pdf.output("arraybuffer");
  if (!isValidPdfBuffer(ab)) {
    throw new Error("PDF повреждён при создании");
  }

  const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const blob = new Blob([ab], { type: "application/pdf" });

  // Диалог «Сохранить как» (работает на http://localhost, не на file://)
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        excludeAcceptAllOption: true,
        types: [
          {
            description: "PDF документ",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // fallback ниже
    }
  }

  // Обычное скачивание в папку «Загрузки»
  if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function") {
    window.navigator.msSaveOrOpenBlob(blob, name);
    return "saved";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.type = "application/pdf";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

function setExportStatus(main, sub) {
  if (els.exportStatus) els.exportStatus.textContent = main;
  if (els.exportSub) els.exportSub.textContent = sub || "";
}

function waitFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Таймаут: ${label}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function getJsPdf() {
  const mod = window.jspdf;
  if (mod && mod.jsPDF) return mod.jsPDF;
  if (typeof window.jsPDF === "function") return window.jsPDF;
  return null;
}

function isExportActive(token) {
  return exportPdf.busy && exportPdf.token === token && !exportPdf.cancelled;
}

function closeExportUi() {
  els.overlay.classList.remove("is-open");
  els.overlay.setAttribute("aria-hidden", "true");
  if (els.exportBtn) els.exportBtn.disabled = false;
  setExportStatus("Генерируем PDF…", "Подготовка страниц");
}

function openExportUi() {
  els.overlay.classList.add("is-open");
  els.overlay.setAttribute("aria-hidden", "false");
  if (els.exportBtn) els.exportBtn.disabled = true;
}

/** Мгновенно закрывает оверлей; фоновый рендер просто игнорируется. */
function cancelExport() {
  if (!exportPdf.busy) {
    closeExportUi();
    return;
  }
  exportPdf.cancelled = true;
  exportPdf.token = (exportPdf.token || 0) + 1;
  exportPdf.busy = false;
  closeExportUi();
  toast("Экспорт отменён");
}

async function renderToCanvas(el) {
  if (typeof html2canvas !== "function") {
    throw new Error("html2canvas не загружен (проверьте интернет / CDN)");
  }

  const width = Math.ceil(el.scrollWidth || el.offsetWidth || 794);
  const height = Math.ceil(el.scrollHeight || el.offsetHeight || 1123);

  return withTimeout(
    html2canvas(el, {
      scale: 1.25,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 4000,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    }),
    20000,
    "рендер страницы"
  );
}

function addCanvasToPdf(pdf, canvas, isFirst) {
  const pageW = 210;
  const pageH = 297;
  const pxPerMm = canvas.width / pageW;
  const pageHeightPx = Math.max(1, Math.floor(pageH * pxPerMm));

  let srcY = 0;
  let firstSlice = true;

  while (srcY < canvas.height) {
    const sliceH = Math.min(pageHeightPx, canvas.height - srcY);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const jpeg = slice.toDataURL("image/jpeg", 0.82);
    const sliceHmm = (sliceH * pageW) / canvas.width;

    if (!(isFirst && firstSlice)) pdf.addPage();
    pdf.addImage(jpeg, "JPEG", 0, 0, pageW, sliceHmm);

    srcY += pageHeightPx;
    firstSlice = false;
    isFirst = false;
  }
}

function printPdf() {
  document.body.classList.add("printing");
  window.print();
  setTimeout(() => document.body.classList.remove("printing"), 500);
}

async function exportPdf(options = {}) {
  const destination = options.destination === "drive" ? "drive" : "download";
  if (exportPdf.busy) return;

  const JsPDF = getJsPdf();
  if (!JsPDF || typeof html2canvas !== "function") {
    toast("Библиотеки PDF не загрузились. Используйте «Печать PDF».");
    return;
  }

  // Сначала авторизация Google (нужен жест пользователя — до долгой генерации)
  let driveAccessToken = null;
  if (destination === "drive") {
    const clientId = ensureGoogleClientId();
    if (!clientId) {
      toast("Для Google Drive нужен Client ID (см. js/config.js)");
      return;
    }
    try {
      toast("Откройте окно входа Google…");
      driveAccessToken = await requestGoogleAccessToken(clientId);
    } catch (err) {
      console.error(err);
      toast("Авторизация Google отменена или не удалась");
      return;
    }
  }

  const token = (exportPdf.token || 0) + 1;
  exportPdf.token = token;
  exportPdf.busy = true;
  exportPdf.cancelled = false;
  openExportUi();
  setExportStatus("Генерируем PDF…", "Подготовка");

  try {
    await waitFrame();
    if (!isExportActive(token)) return;

    setExportStatus("Генерируем PDF…", "Вёрстка страниц");
    await renderPreview();
    await waitForImages(els.guideRoot);
    await waitFrame();
    if (!isExportActive(token)) return;

    const pages = [...els.guideRoot.querySelectorAll(".guide-page")];
    if (!pages.length) throw new Error("Нет страниц для экспорта");

    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    let isFirst = true;

    for (let i = 0; i < pages.length; i++) {
      if (!isExportActive(token)) return;

      setExportStatus("Генерируем PDF…", `Страница ${i + 1} из ${pages.length}`);
      await waitFrame();
      if (!isExportActive(token)) return;

      const page = pages[i];
      page.style.height = "297mm";
      page.style.maxHeight = "297mm";
      page.style.overflow = "hidden";

      const canvas = await renderToCanvas(page);
      if (!isExportActive(token)) return;
      if (!canvas.width || !canvas.height) {
        throw new Error("Пустая страница при экспорте");
      }

      // Каждая DOM-страница = ровно одна страница PDF
      const pageW = 210;
      const pageH = 297;
      const jpeg = canvas.toDataURL("image/jpeg", 0.92);
      if (!jpeg.startsWith("data:image/jpeg")) {
        throw new Error("Не удалось подготовить изображение страницы");
      }
      if (!isFirst) pdf.addPage();
      pdf.addImage(jpeg, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      isFirst = false;
    }

    if (!isExportActive(token)) return;

    if (destination === "drive") {
      setExportStatus("Отправляем на Google Drive…", "Загрузка файла");
      await waitFrame();
      if (!isExportActive(token)) return;

      const blob = pdfToBlob(pdf);
      const name = displayFilename(state.title);
      const file = await uploadPdfToDrive(blob, name, driveAccessToken);
      if (!isExportActive(token)) return;

      toast(file?.name ? `На Drive: ${file.name}` : "PDF отправлен на Google Drive");
      if (file?.webViewLink) {
        try {
          window.open(file.webViewLink, "_blank", "noopener");
        } catch {
          /* ignore */
        }
      }
    } else {
      setExportStatus("Сохраняем файл…", "Выберите папку для сохранения");
      await waitFrame();
      if (!isExportActive(token)) return;

      const result = await downloadPdfDocument(pdf, safeFilename(state.title));
      if (result === "cancelled") {
        toast("Сохранение отменено");
      } else {
        toast("PDF сохранён. Откройте файл через Adobe / Edge");
      }
    }
  } catch (err) {
    if (!isExportActive(token)) return;
    console.error(err);
    if (destination === "drive") {
      toast("Не удалось отправить на Google Drive");
    } else {
      toast("Сбой экспорта. Попробуйте «Печать PDF» → Сохранить как PDF");
    }
  } finally {
    if (exportPdf.token === token) {
      exportPdf.busy = false;
      exportPdf.cancelled = false;
      closeExportUi();
    }
  }
}

function init() {
  els.title = $("#guide-title");
  els.subtitle = $("#guide-subtitle");
  els.meta = $("#guide-meta");
  els.bulkText = $("#bulk-text");
  els.blocksList = $("#blocks-list");
  els.addType = $("#add-block-type");
  els.addBlock = $("#btn-add-block");
  els.clear = $("#btn-clear");
  els.previewToggle = $("#btn-preview-toggle");
  els.exportBtn = $("#btn-export");
  els.printBtn = $("#btn-print");
  els.cancelExport = $("#btn-cancel-export");
  els.guideRoot = $("#guide-root");
  els.previewPanel = $("#preview-panel");
  els.toast = $("#toast");
  els.overlay = $("#export-overlay");
  els.saveChoiceOverlay = $("#save-choice-overlay");
  els.exportStatus = $("#export-status");
  els.exportSub = $("#export-sub");

  closeExportUi();
  closeSaveChoice();
  exportPdf.busy = false;
  exportPdf.cancelled = false;

  loadState();
  if (typeof state.logoPlate === "undefined") state.logoPlate = true;
  syncFormFromState();
  bindUploads();
  bindForm();
  renderBlocksEditor();
  renderPreview();

  recompressStoredImages().catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
