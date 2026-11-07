(function () {
  'use strict';

  const STORAGE_KEY = 'hanshift.state.v1';
  const THEME_KEY = 'hanshift.theme';
  const CONVERSION_DELAY = 60;

  const VALID_DIRECTIONS = new Set(['cn2t', 't2cn']);
  const VALID_VARIANTS = new Set(['twp', 'tw', 'hk', 'hkp', 't']);

  const VARIANT_META = {
    twp: { pane: 'Taiwan phrases', file: 'taiwan' },
    tw: { pane: 'Taiwan', file: 'taiwan-standard' },
    hk: { pane: 'Hong Kong', file: 'hong-kong' },
    hkp: { pane: 'Hong Kong phrases', file: 'hong-kong-phrases' },
    t: { pane: 'OpenCC standard', file: 'standard' }
  };

  const SAMPLES = {
    cn2t: '这个软件让你直接在浏览器里转换中文，不需要安装任何程序。你可以选择台湾或香港的用词，例如“鼠标”“自行车”和“网络”。',
    t2cn: '這個軟體讓你直接在瀏覽器裡轉換中文，不需要安裝任何程式。你可以選擇台灣或香港的用詞，例如「滑鼠」「腳踏車」和「網路」。'
  };

  const QUOTE_INPUTS = {
    traditional: [
      { open: '\u201C', close: '\u201D' },
      { open: '\u2018', close: '\u2019' }
    ],
    simplified: [
      { open: '\u300C', close: '\u300D' },
      { open: '\u300E', close: '\u300F' }
    ]
  };

  // Output styles are indexed by nesting depth: alternate between the
  // primary pair and the secondary pair, starting with the primary one.
  const QUOTE_OUTPUTS = {
    traditional: {
      open: ['\u300C', '\u300E'],
      close: ['\u300D', '\u300F']
    },
    simplified: {
      open: ['\u201C', '\u2018'],
      close: ['\u201D', '\u2019']
    }
  };

  const elements = {
    source: document.getElementById('source'),
    output: document.getElementById('output'),
    sourceTitle: document.getElementById('source-title'),
    sourceSub: document.getElementById('source-sub'),
    sourceBadge: document.getElementById('source-badge'),
    targetTitle: document.getElementById('target-title'),
    targetSub: document.getElementById('target-sub'),
    targetBadge: document.getElementById('target-badge'),
    sourceStats: document.getElementById('source-stats'),
    targetStats: document.getElementById('target-stats'),
    directionButtons: Array.from(document.querySelectorAll('[data-direction]')),
    variant: document.getElementById('variant'),
    variantLabel: document.querySelector('#variant-field .field__label'),
    quoteToggle: document.getElementById('quote-toggle'),
    quoteLabel: document.getElementById('quote-label'),
    quoteHint: document.getElementById('quote-hint'),
    swapBtn: document.getElementById('swap-btn'),
    pasteBtn: document.getElementById('paste-btn'),
    clearBtn: document.getElementById('clear-btn'),
    sampleBtn: document.getElementById('sample-btn'),
    copyBtn: document.getElementById('copy-btn'),
    copyLabel: document.getElementById('copy-label'),
    copyIcon: document.querySelector('#copy-icon use'),
    downloadBtn: document.getElementById('download-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    themeColor: document.getElementById('theme-color'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    toastAction: document.getElementById('toast-action')
  };

  let state = loadState();
  let conversionTimer = 0;
  let saveTimer = 0;
  let toastTimer = 0;
  let copyTimer = 0;
  let toastActionHandler = null;
  let converterCache = new Map();
  let lastErrorShown = false;

  const engineAvailable = Boolean(window.OpenCC && typeof window.OpenCC.Converter === 'function');

  function loadState() {
    const fallback = {
      direction: 'cn2t',
      variant: 'twp',
      quotes: false,
      text: ''
    };

    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return fallback;

      return {
        direction: VALID_DIRECTIONS.has(saved.direction) ? saved.direction : fallback.direction,
        variant: VALID_VARIANTS.has(saved.variant) ? saved.variant : fallback.variant,
        quotes: typeof saved.quotes === 'boolean' ? saved.quotes : fallback.quotes,
        text: typeof saved.text === 'string' ? saved.text : fallback.text
      };
    } catch (error) {
      return fallback;
    }
  }

  function cancelScheduledConversion() {
    if (conversionTimer) {
      window.clearTimeout(conversionTimer);
      conversionTimer = 0;
    }
  }

  function scheduleConversion() {
    cancelScheduledConversion();
    conversionTimer = window.setTimeout(function () {
      conversionTimer = 0;
      runConversion();
    }, CONVERSION_DELAY);
  }

  function flushScheduledConversion() {
    if (!conversionTimer) return;

    cancelScheduledConversion();
    runConversion();
  }

  function scheduleSave() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 300);
  }

  function saveState() {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        direction: state.direction,
        variant: state.variant,
        quotes: state.quotes,
        text: elements.source.value
      }));
    } catch (error) {
      // Storage can be unavailable in private browsing or when it is full.
    }
  }

  function getConverter() {
    if (!engineAvailable) {
      throw new Error('OpenCC is not available');
    }

    const from = state.direction === 'cn2t' ? 'cn' : state.variant;
    const to = state.direction === 'cn2t' ? state.variant : 'cn';
    const key = from + '>' + to;

    if (!converterCache.has(key)) {
      converterCache.set(key, window.OpenCC.Converter({ from: from, to: to }));
    }

    return converterCache.get(key);
  }

  function isWordApostrophe(characters, index) {
    if (characters[index] !== '\u2019') return false;

    const previous = characters[index - 1] || '';
    const next = characters[index + 1] || '';

    // U+2019 is both a closing quote and the apostrophe in English words such
    // as "don’t" and "It’s". A closing quote next to Chinese text is never
    // mistaken, because only Latin letters and digits count as word context.
    return /[A-Za-z0-9]/.test(next) && (!previous || /[A-Za-z0-9\s]/.test(previous));
  }

  function styleQuotes(text, targetIsTraditional) {
    const inputPairs = targetIsTraditional ? QUOTE_INPUTS.traditional : QUOTE_INPUTS.simplified;
    const output = targetIsTraditional ? QUOTE_OUTPUTS.traditional : QUOTE_OUTPUTS.simplified;
    const pairByOpen = new Map();
    const pairByClose = new Map();

    for (const pair of inputPairs) {
      pairByOpen.set(pair.open, pair);
      pairByClose.set(pair.close, pair);
    }

    const characters = Array.from(text);
    const openQuotes = [];

    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index];
      const openingPair = pairByOpen.get(character);

      if (openingPair) {
        openQuotes.push({ index: index, pair: openingPair });
        continue;
      }

      const closingPair = pairByClose.get(character);
      if (!closingPair) continue;

      if (isWordApostrophe(characters, index)) continue;

      // Leave unmatched or improperly nested quotes untouched.
      const openQuote = openQuotes[openQuotes.length - 1];
      if (!openQuote || openQuote.pair !== closingPair) continue;

      openQuotes.pop();

      // openQuotes.length is the number of enclosing quotes. Using depth
      // rather than the input pair keeps mixed nesting correct, such as
      // ‘outer “inner”’ → 「outer 『inner』」.
      const level = openQuotes.length % 2;
      characters[openQuote.index] = output.open[level];
      characters[index] = output.close[level];
    }

    return characters.join('');
  }

  function convertText(text) {
    if (!text) return '';

    let converted;

    try {
      converted = getConverter()(text);
    } catch (error) {
      if (!lastErrorShown) {
        lastErrorShown = true;
        showToast('The conversion engine had a problem. Please refresh the page.');
        console.error('HanShift conversion error:', error);
      }
      return '';
    }

    lastErrorShown = false;

    if (state.quotes) {
      converted = styleQuotes(converted, state.direction === 'cn2t');
    }

    return converted;
  }

  function runConversion() {
    cancelScheduledConversion();
    resetCopyState();

    if (!elements.source.value) {
      elements.output.value = '';
      updateStats();
      updateButtonStates();
      scheduleSave();
      return;
    }

    if (!engineAvailable) {
      elements.output.value = '';
      updateStats();
      updateButtonStates();
      return;
    }

    elements.output.value = convertText(elements.source.value);
    updateStats();
    updateButtonStates();
    scheduleSave();
  }

  function getTextStats(text) {
    if (!text) return { characters: 0, lines: 0 };

    return {
      characters: Array.from(text).length,
      lines: text.split(/\r\n|\r|\n/).length
    };
  }

  function formatStats(text) {
    const stats = getTextStats(text);
    const characterLabel = stats.characters === 1 ? 'character' : 'characters';
    const lineLabel = stats.lines === 1 ? 'line' : 'lines';
    return stats.characters.toLocaleString('en-US') + ' ' + characterLabel + ' · ' +
      stats.lines.toLocaleString('en-US') + ' ' + lineLabel;
  }

  function updateStats() {
    elements.sourceStats.textContent = formatStats(elements.source.value);
    elements.targetStats.textContent = formatStats(elements.output.value);
  }

  function updateButtonStates() {
    const hasSource = elements.source.value.length > 0;
    const hasOutput = elements.output.value.length > 0;

    // A conversion can still be waiting on the debounce, so keep Copy and
    // Download enabled while there is source text to flush. Both handlers
    // flush pending work before reading the output.
    const resultPending = hasSource && !hasOutput && engineAvailable;

    elements.clearBtn.disabled = !hasSource;
    elements.copyBtn.disabled = !hasOutput && !resultPending;
    elements.downloadBtn.disabled = !hasOutput && !resultPending;
  }

  function updateDirectionUI() {
    const isCn2t = state.direction === 'cn2t';
    const meta = VARIANT_META[state.variant];

    for (const button of elements.directionButtons) {
      const isActive = button.dataset.direction === state.direction;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }

    elements.variant.value = state.variant;
    elements.variantLabel.textContent = isCn2t ? 'Traditional style' : 'Traditional input';
    elements.quoteToggle.checked = state.quotes;

    elements.quoteLabel.textContent = isCn2t
      ? 'Use corner quotes 「 」'
      : 'Use curly quotes “ ”';
    elements.quoteHint.textContent = isCn2t
      ? 'Taiwan & Hong Kong typography'
      : 'Mainland typography';

    elements.sourceTitle.textContent = isCn2t ? 'Simplified Chinese' : 'Traditional Chinese';
    elements.sourceSub.textContent = isCn2t ? '简体中文 · input' : '繁體中文 · input';
    elements.sourceBadge.textContent = isCn2t ? '简' : '繁';
    elements.sourceBadge.lang = isCn2t ? 'zh-Hans' : 'zh-Hant';
    elements.sourceBadge.classList.toggle('script-badge--s', isCn2t);
    elements.sourceBadge.classList.toggle('script-badge--t', !isCn2t);
    elements.source.lang = isCn2t ? 'zh-Hans' : 'zh-Hant';
    elements.source.placeholder = isCn2t
      ? 'Paste or type Simplified Chinese here…'
      : 'Paste or type Traditional Chinese here…';

    elements.targetTitle.textContent = isCn2t ? 'Traditional Chinese' : 'Simplified Chinese';
    elements.targetSub.textContent = isCn2t
      ? '繁體中文 · ' + meta.pane
      : '简体中文 · Mainland';
    elements.targetBadge.textContent = isCn2t ? '繁' : '简';
    elements.targetBadge.lang = isCn2t ? 'zh-Hant' : 'zh-Hans';
    elements.targetBadge.classList.toggle('script-badge--s', !isCn2t);
    elements.targetBadge.classList.toggle('script-badge--t', isCn2t);
    elements.output.lang = isCn2t ? 'zh-Hant' : 'zh-Hans';

    if (engineAvailable) {
      elements.output.placeholder = isCn2t
        ? 'Traditional Chinese will appear here…'
        : 'Simplified Chinese will appear here…';
    } else {
      elements.output.placeholder = 'Conversion engine unavailable — please refresh the page.';
    }
  }

  function switchDirection(direction) {
    if (!VALID_DIRECTIONS.has(direction) || state.direction === direction) return;

    cancelScheduledConversion();

    // Refresh the result first, then carry it into the input so changing
    // direction never feeds text in the wrong script to the engine.
    runConversion();
    const previousOutput = elements.output.value;

    state.direction = direction;
    updateDirectionUI();

    if (previousOutput) {
      elements.source.value = previousOutput;
    }

    runConversion();
    scheduleSave();
  }

  function resetCopyState() {
    if (copyTimer) {
      window.clearTimeout(copyTimer);
      copyTimer = 0;
    }

    elements.copyBtn.classList.remove('is-success');
    elements.copyLabel.textContent = 'Copy';
    elements.copyIcon.setAttribute('href', '#icon-copy');
  }

  function markCopied() {
    resetCopyState();
    elements.copyBtn.classList.add('is-success');
    elements.copyLabel.textContent = 'Copied';
    elements.copyIcon.setAttribute('href', '#icon-check');

    copyTimer = window.setTimeout(function () {
      copyTimer = 0;
      resetCopyState();
    }, 1800);
  }

  function hideToast() {
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = 0;
    }

    elements.toast.classList.remove('is-visible');
    elements.toastAction.hidden = true;
    toastActionHandler = null;
  }

  function showToast(message, action) {
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = 0;
    }

    const hasAction = Boolean(action && action.label && typeof action.onAction === 'function');

    elements.toastMessage.textContent = message;
    elements.toastAction.hidden = !hasAction;
    toastActionHandler = hasAction ? action.onAction : null;

    if (hasAction) {
      elements.toastAction.textContent = action.label;
    }

    elements.toast.classList.add('is-visible');

    toastTimer = window.setTimeout(function () {
      hideToast();
    }, hasAction ? 8000 : 2400);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall through to the selection-based copy method.
      }
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.setAttribute('aria-hidden', 'true');
    helper.style.position = 'fixed';
    helper.style.top = '-9999px';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }

    helper.remove();
    return copied;
  }

  async function handleCopy() {
    flushScheduledConversion();

    const text = elements.output.value;
    if (!text) {
      showToast('There is nothing to copy yet.');
      return;
    }

    const copied = await copyToClipboard(text);
    if (copied) {
      markCopied();
      showToast('Copied to clipboard.');
      elements.copyBtn.focus({ preventScroll: true });
    } else {
      showToast('Couldn’t copy automatically — select the result and copy it manually.');
      elements.output.focus();
      elements.output.select();
    }
  }

  function appendToSource(text) {
    const currentText = elements.source.value;
    const separator = currentText && !currentText.endsWith('\n') ? '\n' : '';

    elements.source.value = currentText + separator + text;
    elements.source.setSelectionRange(elements.source.value.length, elements.source.value.length);
    elements.source.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function handlePaste() {
    let text = '';

    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        throw new Error('Clipboard reading is not available');
      }
      text = await navigator.clipboard.readText();
    } catch (error) {
      showToast('Clipboard access is blocked — use your browser’s paste command (Ctrl/Cmd+V) or long-press.');
      elements.source.focus();
      return;
    }

    if (!text) {
      showToast('Your clipboard is empty.');
      elements.source.focus();
      return;
    }

    appendToSource(text);
    elements.source.focus();
  }

  function captureSourceSnapshot() {
    return {
      text: elements.source.value,
      start: elements.source.selectionStart,
      end: elements.source.selectionEnd
    };
  }

  function restoreSourceSnapshot(snapshot) {
    elements.source.value = snapshot.text;
    runConversion();
    elements.source.focus();

    const length = elements.source.value.length;
    const start = Math.min(Math.max(snapshot.start, 0), length);
    const end = Math.min(Math.max(snapshot.end, 0), length);
    elements.source.setSelectionRange(start, end);
  }

  function handleSample() {
    const snapshot = captureSourceSnapshot();

    cancelScheduledConversion();
    elements.source.value = state.direction === 'cn2t' ? SAMPLES.cn2t : SAMPLES.t2cn;
    runConversion();
    showToast(
      'Sample loaded. Change the style to compare wording.',
      snapshot.text
        ? { label: 'Undo', onAction: function () { restoreSourceSnapshot(snapshot); } }
        : undefined
    );
  }

  function handleClear() {
    if (!elements.source.value) return;

    const snapshot = captureSourceSnapshot();

    cancelScheduledConversion();
    elements.source.value = '';
    resetCopyState();
    runConversion();
    elements.source.focus();
    showToast('Text cleared.', {
      label: 'Undo',
      onAction: function () { restoreSourceSnapshot(snapshot); }
    });
  }

  function handleSwap() {
    switchDirection(state.direction === 'cn2t' ? 't2cn' : 'cn2t');
  }

  function getLocalDateStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function handleDownload() {
    flushScheduledConversion();

    const text = elements.output.value;
    if (!text) return;

    const fileStyle = state.direction === 'cn2t' ? VARIANT_META[state.variant].file : 'simplified';
    const filename = 'hanshift-' + fileStyle + '-' + getLocalDateStamp() + '.txt';
    const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    showToast('Download started.');
  }

  function applyTheme(theme, persist) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;

    const destination = nextTheme === 'dark' ? 'light' : 'dark';
    const label = 'Switch to ' + destination + ' theme';
    elements.themeToggle.setAttribute('aria-label', label);
    elements.themeToggle.title = label;

    if (elements.themeColor) {
      elements.themeColor.setAttribute('content', nextTheme === 'dark' ? '#12100d' : '#f5f1e8');
    }

    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, nextTheme);
      } catch (error) {
        // The theme still applies for this page view.
      }
    }
  }

  function setupTheme() {
    const currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(currentTheme, false);

    elements.themeToggle.addEventListener('click', function () {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true);
    });

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = function (event) {
        let hasSavedTheme = false;

        try {
          hasSavedTheme = Boolean(window.localStorage.getItem(THEME_KEY));
        } catch (error) {
          hasSavedTheme = false;
        }

        if (!hasSavedTheme) {
          applyTheme(event.matches ? 'dark' : 'light', false);
        }
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', onChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(onChange);
      }
    }
  }

  function bindEvents() {
    elements.source.addEventListener('input', function () {
      if (toastActionHandler) hideToast();
      resetCopyState();
      updateStats();
      updateButtonStates();
      scheduleConversion();
      scheduleSave();
    });

    for (const button of elements.directionButtons) {
      button.addEventListener('click', function () {
        switchDirection(button.dataset.direction);
      });
    }

    elements.variant.addEventListener('change', function () {
      if (!VALID_VARIANTS.has(elements.variant.value)) return;
      state.variant = elements.variant.value;
      updateDirectionUI();
      runConversion();
      scheduleSave();
    });

    elements.quoteToggle.addEventListener('change', function () {
      state.quotes = elements.quoteToggle.checked;
      runConversion();
      scheduleSave();
    });

    elements.swapBtn.addEventListener('click', handleSwap);
    elements.copyBtn.addEventListener('click', handleCopy);
    elements.pasteBtn.addEventListener('click', handlePaste);
    elements.clearBtn.addEventListener('click', handleClear);
    elements.sampleBtn.addEventListener('click', handleSample);
    elements.downloadBtn.addEventListener('click', handleDownload);
    elements.toastAction.addEventListener('click', function () {
      const action = toastActionHandler;
      hideToast();
      if (action) action();
    });

    window.addEventListener('pagehide', saveState);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveState();
    });
  }

  function init() {
    // The engine is about 1 MB, so on a slow connection someone can start
    // typing before this runs. Keep that text instead of replacing it with
    // the previously saved state.
    const textTypedBeforeInit = elements.source.value;
    elements.source.value = textTypedBeforeInit || state.text;

    updateDirectionUI();
    updateStats();
    updateButtonStates();
    setupTheme();
    bindEvents();

    if (elements.source.value) {
      runConversion();
    }

    if (!engineAvailable) {
      showToast('The conversion engine could not load. Please refresh the page.');
      console.error('HanShift: OpenCC failed to load.');
    }
  }

  init();
}());
