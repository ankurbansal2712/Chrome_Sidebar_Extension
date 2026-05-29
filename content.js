// content.js
console.log('AI Sidebar content script loaded');

// ── Site Configuration ────────────────────────────────────────────────────────
// To add a new site, just add a new entry here. Nothing else needs to change.

const SITE_CONFIG = {
  'claude.ai': {
    userMessageSelector: '[data-testid="user-message"]',
    fileSelector: '[data-testid="file-thumbnail"]',
    fileParentCheck: '[data-testid="file-thumbnail"]',
    scrollContainer: '[data-autoscroll-container]',
    getText: (el) => el.querySelector('p')?.textContent.trim() || el.textContent.trim(),
  },
  /*'chatgpt.com': {
    userMessageSelector: '[data-message-author-role="user"]',
    fileSelector: null,
    fileParentCheck: null,
    scrollContainer: null,
    getText: (el) => el.textContent.trim(),
  },
  'gemini.google.com': {
  userMessageSelector: 'user-query-content',
  fileSelector: null,
  fileParentCheck: null,
  scrollContainer: null,
  getText: (el) => el.querySelector('.query-text-line')?.textContent.trim() || el.textContent.trim(),
    },*/
};

// Detect current site, fall back to claude.ai if unknown
const config = SITE_CONFIG[location.hostname] || SITE_CONFIG['claude.ai'];

// ── Sidebar Creation ──────────────────────────────────────────────────────────

function createSidebar() {
  if (document.getElementById('ai-sidebar')) return;

  const toggle = document.createElement('div');
  toggle.id = 'ai-sidebar-toggle';
  toggle.innerHTML = '☰';

  const sidebar = document.createElement('div');
  sidebar.id = 'ai-sidebar';

  const theme = `theme-${location.hostname.replace(/\./g, '-')}`;
    toggle.classList.add(theme);
    sidebar.classList.add(theme);

  const title = document.createElement('div');
  title.id = 'ai-sidebar-title';
  title.innerText = 'Questions';

  const search = document.createElement('input');
  search.id = 'ai-sidebar-search';
  search.placeholder = 'Search questions...';
  search.addEventListener('input', () => {
    const query = search.value.toLowerCase().trim();
    document.querySelectorAll('.ai-sidebar-item').forEach(item => {
      const text = item.querySelector('.ai-sidebar-text').textContent.toLowerCase();
      if (text.includes(query) || query === '') {
        item.classList.remove('hidden-item');
      } else {
        item.classList.add('hidden-item');
      }
    });
  });

  const list = document.createElement('div');
  list.id = 'ai-sidebar-list';

  sidebar.appendChild(title);
  sidebar.appendChild(search);
  sidebar.appendChild(list);

  const jumpBtn = document.createElement('div');
    jumpBtn.id = 'ai-sidebar-jump';
    jumpBtn.textContent = '⬇';
    jumpBtn.title = 'Jump to latest message';

    jumpBtn.addEventListener('click', () => {
    const messages = getMessages();
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];

    // Scroll sidebar list to bottom
    const list = document.getElementById('ai-sidebar-list');
    if (list) list.scrollTop = list.scrollHeight;

    // Scroll page to last message — don't close sidebar
    lastMessage.scrollIntoView({ behavior: 'instant', block: 'center' });
    setTimeout(() => {
        lastMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    });

    sidebar.appendChild(jumpBtn);

  document.body.appendChild(toggle);
  document.body.appendChild(sidebar);

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}

// ── Message Fetching ──────────────────────────────────────────────────────────
// All site-specific DOM logic is isolated here.
// When adding a new site, you only touch SITE_CONFIG and this function.

function getMessages() {

  console.log('config selector:', config.userMessageSelector);
  const userMessages = Array.from(
    document.querySelectorAll(config.userMessageSelector || '')
  );
  console.log('userMessages found:', userMessages.length);
 

  // File thumbnails — only if this site has them
  let fileThumbs = [];
  if (config.fileSelector) {
    fileThumbs = Array.from(document.querySelectorAll(config.fileSelector))
      .filter(el => !el.parentElement.closest(config.fileParentCheck))
      .filter(el => config.scrollContainer
        ? el.closest(config.scrollContainer)
        : true
      );
  }

  // Merge and sort by position on page
    return [...userMessages, ...fileThumbs].sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
}

function getOffsetTop(element, container) {
  let offset = 0;
  let el = element;
  while (el && el !== container) {
    offset += el.offsetTop;
    el = el.offsetParent;
  }
  return offset;
}

// ── Pin Storage ───────────────────────────────────────────────────────────────

function getConversationId() {
  return location.pathname.split('/').pop();
}

async function getPins() {
  const key = `pins-${getConversationId()}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

async function savePins(pins) {
  const key = `pins-${getConversationId()}`;
  await chrome.storage.local.set({ [key]: pins });
}

function createItem(message, index, pins, isPinnedSection) {
  const isPinned = pins.includes(index);

  message.id = `user-message-${index}`;
  const rawText = config.getText(message);
  const label = rawText.length > 60 ? rawText.slice(0, 60) + '...' : rawText;

  const item = document.createElement('div');
  item.className = 'ai-sidebar-item' + (isPinned ? ' pinned' : '');

  const badge = document.createElement('span');
  badge.className = 'ai-sidebar-index';
  badge.textContent = index + 1;

  const textNode = document.createElement('span');
  textNode.className = 'ai-sidebar-text';
  textNode.textContent = label;

  // ── Pin button ──────────────────────────────────────────
  const pinBtn = document.createElement('span');
  pinBtn.className = 'ai-sidebar-pin';
  pinBtn.textContent = isPinned ? '★' : '☆';
  pinBtn.title = isPinned ? 'Unstar' : 'Star';

  pinBtn.addEventListener('mouseenter', () => {
    if (isPinned) pinBtn.textContent = '✕';
    else pinBtn.textContent = '★';
    });
    pinBtn.addEventListener('mouseleave', () => {
    pinBtn.textContent = isPinned ? '★' : '☆';
    });
    pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    let currentPins = await getPins();
    if (isPinned) {
      currentPins = currentPins.filter(p => p !== index);
    } else {
      currentPins = [...currentPins, index];
    }
    await savePins(currentPins);
    buildIndex(); // rebuild to reflect changes
  });

  // ── Copy button ─────────────────────────────────────────
  const copyBtn = document.createElement('span');
  copyBtn.className = 'ai-sidebar-copy';
  copyBtn.textContent = '⧉';
  copyBtn.title = 'Copy question';

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const fullText = config.getText(message);
    navigator.clipboard.writeText(fullText).then(() => {
      copyBtn.textContent = '✓';
      copyBtn.style.color = '#22c55e';
      setTimeout(() => {
        copyBtn.textContent = '⧉';
        copyBtn.style.color = '';
      }, 1500);
    });
  });

  // ── Scroll on click ─────────────────────────────────────
  item.addEventListener('click', () => {
    const container = config.scrollContainer
      ? document.querySelector(config.scrollContainer)
      : null;

    document.getElementById('ai-sidebar').classList.remove('open');

    if (container) {
      message.scrollIntoView({ behavior: 'instant', block: 'center' });
      setTimeout(() => {
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  const actions = document.createElement('div');
    actions.className = 'ai-sidebar-actions';
    actions.appendChild(pinBtn);
    actions.appendChild(copyBtn);

    item.appendChild(badge);
    item.appendChild(textNode);
    item.appendChild(actions);

  return item;
}

// ── Index Builder ─────────────────────────────────────────────────────────────

async function buildIndex() {
  const list = document.getElementById('ai-sidebar-list');
  if (!list) return;

  const messages = getMessages();
  if (messages.length === 0) return;

  const pins = await getPins();
  list.innerHTML = '';

  // ── Pinned section ──────────────────────────────────────
  const pinnedMessages = messages.filter((_, i) => pins.includes(i));

  if (pinnedMessages.length > 0) {
    const pinnedHeader = document.createElement('div');
    pinnedHeader.className = 'ai-sidebar-section-header';
    pinnedHeader.textContent = '★ Starred';
    list.appendChild(pinnedHeader);

    pinnedMessages.forEach((message, _) => {
      const originalIndex = messages.indexOf(message);
      list.appendChild(createItem(message, originalIndex, pins, true));
    });

    const allHeader = document.createElement('div');
    allHeader.className = 'ai-sidebar-section-header';
    allHeader.textContent = 'All Questions';
    list.appendChild(allHeader);
  }

  // ── All messages ────────────────────────────────────────
  messages.forEach((message, index) => {
    list.appendChild(createItem(message, index, pins, false));
  });
}

// ── URL Watcher ───────────────────────────────────────────────────────────────

function watchUrlChanges() {
  let lastUrl = location.href;

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => buildIndex(), 1000);
    }
  }, 500);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function waitForConversation() {
  createSidebar();
  buildIndex();
  watchUrlChanges();

  let debounceTimer = null;
  let lastMessageCount = 0;
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastMessageCount = 0;
      buildIndex();
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const currentCount = getMessages().length;
      if (currentCount !== lastMessageCount) {
        lastMessageCount = currentCount;
        buildIndex();
      }
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

waitForConversation();