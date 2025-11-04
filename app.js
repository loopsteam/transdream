
const translateForm = document.querySelector("#translate-form");
const translateBtn = document.querySelector("#translateBtn");
const swapBtn = document.querySelector("#swapBtn");
const sourceLanguage = document.querySelector("#sourceLanguage");
const targetLanguage = document.querySelector("#targetLanguage");
const sourceText = document.querySelector("#sourceText");
const resultBox = document.querySelector("#result");
const statusBox = document.querySelector("#status");

const heroSloganDisplay = document.querySelector("#heroSlogan");
const heroSloganItems = document.querySelectorAll(".hero-slogan-item");
const MESSAGES = {
  idle: "\u5f85\u7ffb\u8bd1",
  empty: "\u8bf7\u8f93\u5165\u9700\u8981\u7ffb\u8bd1\u7684\u5185\u5bb9",
  loading: "\u7ffb\u8bd1\u4e2d...",
  success: "\u7ffb\u8bd1\u5b8c\u6210",
  failure: "\u7ffb\u8bd1\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5",
  parseError: "\u672a\u80fd\u89e3\u6790\u8fd4\u56de\u7684\u7ffb\u8bd1\u7ed3\u679c",
  autoNotAllowed: "\u81ea\u52a8\u68c0\u6d4b\u65e0\u6cd5\u4f5c\u4e3a\u76ee\u6807\u8bed\u8a00",
  requestFailedPrefix: "\u8bf7\u6c42\u5931\u8d25",
  buttonIdle: "\u5f00\u59cb\u7ffb\u8bd1",
  buttonLoading: "\u7ffb\u8bd1\u4e2d...",
  copied: "\u5185\u5bb9\u5df2\u590d\u5236",
};

let copyFeedbackTimer = null;
let lastStatusMessage = MESSAGES.idle;

if (statusBox && !statusBox.textContent.trim()) {
  statusBox.textContent = MESSAGES.idle;
  lastStatusMessage = MESSAGES.idle;
}

translateBtn?.addEventListener("click", handleTranslate);
swapBtn?.addEventListener("click", swapLanguages);
translateForm?.addEventListener("submit", handleTranslate);
sourceText?.addEventListener("input", handleSourceInput);
resultBox?.addEventListener("click", handleResultClick);

function initHeroSlogans() {
  if (!heroSloganDisplay) {
    return;
  }

  const slogans = Array.from(heroSloganItems ?? [], (item) => item.textContent?.trim() ?? "")
    .filter((text) => text.length);

  if (!slogans.length) {
    if (!heroSloganDisplay.textContent && heroSloganItems.length) {
      heroSloganDisplay.textContent = heroSloganItems[0].textContent?.trim() ?? "";
      heroSloganDisplay.classList.add("is-visible");
    }
    return;
  }

  let currentIndex = 0;
  const fadeDelay = 260;
  const intervalMs = 4200;

  const applySlogan = (index) => {
    heroSloganDisplay.textContent = slogans[index];
    heroSloganDisplay.classList.add("is-visible");
  };

  applySlogan(currentIndex);

  if (slogans.length === 1) {
    return;
  }

  window.setInterval(() => {
    heroSloganDisplay.classList.remove("is-visible");
    window.setTimeout(() => {
      currentIndex = (currentIndex + 1) % slogans.length;
      applySlogan(currentIndex);
    }, fadeDelay);
  }, intervalMs);
}
initHeroSlogans();
function handleSourceInput() {
  resetResult();
  const value = sourceText?.value ?? "";
  setStatus(value.trim() ? MESSAGES.idle : MESSAGES.empty);
}

function swapLanguages() {
  if (!sourceLanguage || !targetLanguage) {
    return;
  }

  const currentSource = sourceLanguage.value;
  const currentTarget = targetLanguage.value;

  if (currentSource === "auto") {
    setStatus(MESSAGES.autoNotAllowed);
    return;
  }

  sourceLanguage.value = currentTarget;
  targetLanguage.value = currentSource;
}

async function handleTranslate(event) {
  event?.preventDefault();

  const text = sourceText?.value ?? "";
  const trimmed = text.trim();

  if (!trimmed) {
    setStatus(MESSAGES.empty);
    return;
  }

  toggleLoading(true);
  setStatus(MESSAGES.loading);
  resetResult();

  try {
    const payload = buildTranslateRequest(trimmed);
    const response = await fetch("/.netlify/functions/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${MESSAGES.requestFailedPrefix} (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const translation = readTranslationFromResponse(data);

    if (!translation || !translation.text) {
      throw new Error(MESSAGES.parseError);
    }

    setStatus(MESSAGES.success);
    renderResult(text, translation);
  } catch (error) {
    console.error(error);
    setStatus(MESSAGES.failure);
    if (resultBox) {
      resultBox.textContent = error.message;
      resultBox.classList.remove("revealed");
    }
  } finally {
    toggleLoading(false);
  }
}

function buildTranslateRequest(text) {
  const from = sourceLanguage?.value ?? "auto";
  const to = targetLanguage?.value ?? "en";

  return {
    text,
    sourceLanguage: from,
    targetLanguage: to,
  };
}

function readTranslationFromResponse(data) {
  const rawText = extractRawTranslationText(data);
  if (!rawText) {
    return { text: "", alignments: [] };
  }
  return parseStructuredTranslation(rawText);
}

function extractRawTranslationText(data) {
  if (!data) {
    return "";
  }

  if (Array.isArray(data.output)) {
    for (const block of data.output) {
      if (!block || !Array.isArray(block.content)) {
        continue;
      }
      for (const item of block.content) {
        if (item?.type === "output_text" && typeof item.text === "string") {
          return item.text;
        }
      }
    }
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  return "";
}

function parseStructuredTranslation(rawText) {
  const trimmed = rawText.trim();

  const direct = tryParseJSON(trimmed);
  if (direct) {
    const normalized = normalizeParsedTranslation(direct);
    if (normalized.text) {
      return normalized;
    }
  }

  const jsonCandidate = extractJsonString(trimmed);
  if (jsonCandidate) {
    const parsed = tryParseJSON(jsonCandidate);
    if (parsed) {
      const normalized = normalizeParsedTranslation(parsed);
      if (normalized.text) {
        return normalized;
      }
    }
  }

  return {
    text: trimmed,
    alignments: [],
  };
}

function tryParseJSON(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function extractJsonString(text) {
  if (!text) {
    return null;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function normalizeParsedTranslation(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { text: "", alignments: [] };
  }

  const text =
    getFirstString(parsed, ["translation", "translated_text", "translatedText", "result", "text"]) ||
    reconstructTextFromParsed(parsed) ||
    "";

  let alignments = [];
  const alignmentCandidate =
    parsed.alignments ??
    parsed.alignment ??
    parsed.mapping ??
    parsed.word_alignment ??
    parsed.wordAlignment;

  if (Array.isArray(alignmentCandidate)) {
    alignments = alignmentCandidate;
  } else if (alignmentCandidate && typeof alignmentCandidate === "object") {
    if (Array.isArray(alignmentCandidate.pairs)) {
      alignments = alignmentCandidate.pairs;
    } else if (Array.isArray(alignmentCandidate.items)) {
      alignments = alignmentCandidate.items;
    }
  }

  return {
    text,
    alignments,
  };
}

function reconstructTextFromParsed(parsed) {
  if (Array.isArray(parsed.sentences)) {
    return parsed.sentences.join("");
  }
  if (Array.isArray(parsed.translation)) {
    return parsed.translation.join("");
  }
  if (parsed.translation && typeof parsed.translation === "object") {
    return (
      getFirstString(parsed.translation, ["text", "value", "content"]) ||
      extractString(parsed.translation, ["sentence"]) ||
      ""
    );
  }
  return "";
}

function getFirstString(source, keys) {
  if (!source || typeof source !== "object") {
    return null;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === "object") {
      const nested =
        getFirstString(value, ["text", "value", "translation"]) ??
        (Array.isArray(value) ? value.find((item) => typeof item === "string" && item.trim()) : null);
      if (typeof nested === "string" && nested.trim()) {
        return nested.trim();
      }
    }
  }
  return null;
}

function renderResult(sourceContent, translationData) {
  if (!resultBox) {
    return;
  }

  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  }
  resultBox.classList.remove("copied");

  const normalized =
    typeof translationData === "string"
      ? { text: translationData, alignments: [] }
      : translationData || { text: "", alignments: [] };

  const translationText = normalized.text ?? "";

  if (!translationText) {
    resultBox.textContent = "";
    resultBox.classList.remove("revealed");
    return;
  }

  const sentenceNodes = buildSentenceNodes(translationText);

  if (sentenceNodes.length) {
    resultBox.replaceChildren(...sentenceNodes);
  } else {
    resultBox.textContent = translationText;
  }

  resultBox.classList.add("revealed");
}

function handleResultClick(event) {
  if (!resultBox) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const text = resultBox.textContent?.trim() ?? "";
  if (!text) {
    return;
  }

  const restoreMessage = lastStatusMessage;
  copyTextToClipboard(text);
  resultBox.classList.add("copied");
  setStatus(MESSAGES.copied);

  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
  }
  copyFeedbackTimer = window.setTimeout(() => {
    resultBox?.classList.remove("copied");
    if (statusBox?.textContent?.trim() === MESSAGES.copied) {
      setStatus(restoreMessage);
    }
  }, 1200);
}

function copyTextToClipboard(text) {
  if (!text) {
    return;
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    return;
  }

  fallbackCopyText(text);
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } catch (error) {
    console.error("复制失败", error);
  } finally {
    document.body.removeChild(textarea);
  }
}

function resetResult() {
  if (!resultBox) {
    return;
  }
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  }
  resultBox.replaceChildren();
  resultBox.classList.remove("revealed", "copied");
}

function toggleLoading(isLoading) {
  if (!translateBtn) {
    return;
  }

  translateBtn.disabled = isLoading;
  translateBtn.textContent = isLoading ? MESSAGES.buttonLoading : MESSAGES.buttonIdle;
}

function setStatus(message) {
  if (!statusBox || !message) {
    return;
  }
  statusBox.textContent = message;
  if (message !== MESSAGES.copied) {
    lastStatusMessage = message;
  }
}

function segmentSentences(text) {
  if (!text) {
    return [];
  }

  if (window.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    return Array.from(segmenter.segment(text)).map((segment) => segment.segment);
  }

  return fallbackSegmentSentences(text);
}

function fallbackSegmentSentences(text) {
  const sentences = [];
  let buffer = "";
  const isTerminator = (char) => /[。！？!?]/.test(char);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    buffer += char;

    if (isTerminator(char)) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        buffer += text[j];
        i = j;
        j += 1;
      }
      sentences.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    sentences.push(buffer);
  }

  return sentences;
}

function buildSentenceNodes(text) {
  const segments = segmentSentences(text);
  if (!segments.length) {
    return [];
  }

  return segments.map((segment) => {
    const span = document.createElement("span");
    span.textContent = segment;
    span.classList.add("sentence-chunk");
    span.tabIndex = 0;
    span.addEventListener("mouseenter", () => span.classList.add("is-highlighted"));
    span.addEventListener("mouseleave", () => span.classList.remove("is-highlighted"));
    span.addEventListener("focus", () => span.classList.add("is-highlighted"));
    span.addEventListener("blur", () => span.classList.remove("is-highlighted"));
    return span;
  });
}

