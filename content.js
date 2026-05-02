(() => {
  if (window.__agentStickyNotesInjected) return;
  window.__agentStickyNotesInjected = true;

  const DEFAULT_NOTES = [
    "submission request via direct email",
    "submission request via contact us form",
    "submission request via disposable email",
    "Removed",
    "no more results showing",
    "No VPN Working",
    "legal escalation",
    "Portal DB's",
    "Wrong captured by the bot",
    "captcha error",
    "page error",
    "cant submit right now",
    "FULL QA/PENDING DBs:",
    "FULL QA/B2B: / PENDING DBs:",
    "T10/ PD-CM",
    "T10/Resubmission-Run Automation",
    "T11/ PD-CM",
    "T11/Resubmission-Run Automation",
    "Partial QA / Pending Data Brokers:",
    "Full QA / Pending Data Brokers:"
  ];

  const STORAGE_KEY = "agentStickyNotesData";
  const defaultState = {
    notes: DEFAULT_NOTES,
    collapsed: false,
    darkMode: false,
    visible: true,
    position: { x: null, y: null },
    shortcuts: {
      toggleCollapse: "Alt+Shift+M",
      toggleVisible: "Alt+Shift+X"
    },
    showShortcuts: false,
    selectedDate: "",
    agentName: ""
  };

  let state = { ...defaultState };
  let searchQuery = "";
  let addMode = false;
  let dragging = null;
  let toastTimer = null;
  let agentNameSaveTimer = null;

  const ids = {
    panel: "asn-panel",
    body: "asn-body",
    search: "asn-search",
    list: "asn-list",
    addRow: "asn-add-row",
    addInput: "asn-input",
    toast: "asn-toast",
    empty: "asn-empty",
    shortcutCollapse: "asn-shortcut-collapse",
    shortcutVisible: "asn-shortcut-visible",
    shortcutsPanel: "asn-shortcuts-panel",
    dateBtn: "asn-date-btn",
    dateInput: "asn-date-input",
    agentNameInput: "asn-agent-name"
  };

  init().catch((error) => {
    // Keep failures silent to avoid breaking websites.
    console.error("Agent Sticky Notes failed to initialize:", error);
  });

  async function init() {
    state = await loadState();
    buildUI();
    applyStateToUI();
    attachGlobalHandlers();
  }

  function hasChromeStorage() {
    return typeof chrome !== "undefined" && chrome.storage && typeof chrome.storage.local?.get === "function";
  }

  async function loadState() {
    let fromStorage = null;
    if (hasChromeStorage()) {
      fromStorage = await new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res?.[STORAGE_KEY] || null));
      });
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        fromStorage = raw ? JSON.parse(raw) : null;
      } catch (_) {
        fromStorage = null;
      }
    }
    return normalizeState(fromStorage);
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return { ...defaultState };
    const notes = Array.isArray(raw.notes) && raw.notes.length ? raw.notes.filter(Boolean) : DEFAULT_NOTES;
    return {
      notes,
      collapsed: Boolean(raw.collapsed),
      darkMode: Boolean(raw.darkMode),
      visible: raw.visible !== false,
      position: {
        x: Number.isFinite(raw?.position?.x) ? raw.position.x : null,
        y: Number.isFinite(raw?.position?.y) ? raw.position.y : null
      },
      shortcuts: {
        toggleCollapse:
          typeof raw?.shortcuts?.toggleCollapse === "string" && raw.shortcuts.toggleCollapse.trim()
            ? raw.shortcuts.toggleCollapse.trim()
            : defaultState.shortcuts.toggleCollapse,
        toggleVisible:
          typeof raw?.shortcuts?.toggleVisible === "string" && raw.shortcuts.toggleVisible.trim()
            ? raw.shortcuts.toggleVisible.trim()
            : defaultState.shortcuts.toggleVisible
      },
      showShortcuts: Boolean(raw.showShortcuts),
      selectedDate: isISODateString(raw.selectedDate) ? raw.selectedDate : "",
      agentName:
        typeof raw.agentName === "string" ? raw.agentName.slice(0, 64) : defaultState.agentName
    };
  }

  async function saveState() {
    if (hasChromeStorage()) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
      });
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {
        console.error("Agent Sticky Notes: could not persist state.");
      }
    }
  }

  function buildUI() {
    const panel = document.createElement("section");
    panel.id = ids.panel;
    panel.setAttribute("aria-label", "Agent Sticky Notes");

    panel.innerHTML = `
      <div class="asn-header" id="asn-header">
        <div class="asn-title-wrap">
          <span class="asn-drag-indicator" title="Drag to move">⠿</span>
          <span class="asn-file-icon">📄</span>
          <div class="asn-title">Agent Sticky Notes</div>
        </div>
        <div class="asn-header-actions">
          <button class="asn-date-badge" id="${ids.dateBtn}" title="Choose date">${getBadgeDateLabel()}</button>
          <input type="date" id="${ids.dateInput}" class="asn-date-input-popover asn-hidden" />
          <input
            type="text"
            class="asn-agent-name-input"
            id="${ids.agentNameInput}"
            placeholder="Your name"
            title="Included when you copy a note: date, then name, then note"
            maxlength="64"
            autocomplete="name"
          />
          <button class="asn-btn" id="asn-theme-btn" title="Toggle dark mode">🌓</button>
          <button class="asn-btn" id="asn-collapse-btn" title="Collapse panel">−</button>
          <button class="asn-btn" id="asn-close-btn" title="Close panel">✕</button>
        </div>
      </div>
      <div class="asn-tabs">
        <button class="asn-tab-btn asn-tab-active" id="asn-tab-notes">Sticky Notes</button>
        <button class="asn-tab-btn" id="asn-tab-shortcuts">Hotkeys</button>
      </div>
      <div class="asn-body" id="${ids.body}">
        <input class="asn-search" id="${ids.search}" type="text" placeholder="Search notes..." />
        <div class="asn-list" id="${ids.list}"></div>
        <div class="asn-muted asn-hidden" id="${ids.empty}">No matching notes.</div>
        <button class="asn-btn" id="asn-add-toggle">➕ Add Note</button>
        <div class="asn-add-row asn-hidden" id="${ids.addRow}">
          <input class="asn-input" id="${ids.addInput}" type="text" placeholder="Type a new note template..." />
          <button class="asn-btn" id="asn-add-save">Save</button>
        </div>
        <div class="asn-shortcut-wrap asn-hidden" id="${ids.shortcutsPanel}">
          <div class="asn-muted">Shortcuts (click field, then press keys)</div>
          <div class="asn-shortcut-row">
            <label for="${ids.shortcutCollapse}">Minimize</label>
            <input class="asn-input asn-shortcut-input" id="${ids.shortcutCollapse}" type="text" readonly />
          </div>
          <div class="asn-shortcut-row">
            <label for="${ids.shortcutVisible}">Close / Reopen</label>
            <input class="asn-input asn-shortcut-input" id="${ids.shortcutVisible}" type="text" readonly />
          </div>
        </div>
        <div class="asn-footer">
          <span id="asn-count-footer"></span>
          <span class="asn-status">Ready</span>
        </div>
        <div class="asn-toast" id="${ids.toast}"></div>
      </div>
    `;

    document.documentElement.appendChild(panel);
    panel.addEventListener("mousedown", (e) => e.stopPropagation(), true);

    document.getElementById("asn-search").addEventListener("input", onSearchInput);
    document.getElementById("asn-add-toggle").addEventListener("click", onToggleAddMode);
    document.getElementById("asn-add-save").addEventListener("click", onSaveNewNote);
    document.getElementById("asn-theme-btn").addEventListener("click", onToggleTheme);
    document.getElementById("asn-collapse-btn").addEventListener("click", onToggleCollapse);
    document.getElementById("asn-close-btn").addEventListener("click", onToggleVisible);
    document.getElementById(ids.dateBtn).addEventListener("click", onDateBadgeClick);
    document.getElementById(ids.dateInput).addEventListener("change", onDateInputChange);
    document.getElementById(ids.agentNameInput).addEventListener("input", onAgentNameInput);
    document.getElementById("asn-tab-shortcuts").addEventListener("click", onToggleShortcuts);
    document.getElementById("asn-tab-notes").addEventListener("click", onHideShortcuts);
    panel.addEventListener("mousedown", startDrag);
    document.getElementById(ids.shortcutCollapse).addEventListener("keydown", (event) => onShortcutCapture(event, "toggleCollapse"));
    document.getElementById(ids.shortcutVisible).addEventListener("keydown", (event) => onShortcutCapture(event, "toggleVisible"));
  }

  function applyStateToUI() {
    const panel = get(ids.panel);
    const body = get(ids.body);
    const collapseBtn = get("asn-collapse-btn");
    const closeBtn = get("asn-close-btn");
    const addRow = get(ids.addRow);
    const addInput = get(ids.addInput);
    const collapseShortcut = get(ids.shortcutCollapse);
    const visibleShortcut = get(ids.shortcutVisible);
    const shortcutsPanel = get(ids.shortcutsPanel);
    const tabNotes = get("asn-tab-notes");
    const tabShortcuts = get("asn-tab-shortcuts");
    const countFooter = get("asn-count-footer");
    const dateBtn = get(ids.dateBtn);
    const dateInput = get(ids.dateInput);
    const agentNameInput = get(ids.agentNameInput);

    panel.classList.toggle("asn-dark", state.darkMode);
    panel.classList.toggle("asn-hidden", !state.visible);
    body.classList.toggle("asn-hidden", state.collapsed);
    collapseBtn.textContent = state.collapsed ? "+" : "−";
    collapseBtn.title = state.collapsed ? "Expand panel" : "Collapse panel";
    closeBtn.title = state.visible ? "Close panel" : "Reopen panel";
    collapseShortcut.value = state.shortcuts.toggleCollapse;
    visibleShortcut.value = state.shortcuts.toggleVisible;
    shortcutsPanel.classList.toggle("asn-hidden", !state.showShortcuts);
    tabShortcuts.classList.toggle("asn-tab-active", state.showShortcuts);
    tabNotes.classList.toggle("asn-tab-active", !state.showShortcuts);
    countFooter.textContent = `${state.notes.length} notes saved`;
    dateBtn.textContent = getBadgeDateLabel();
    dateInput.value = state.selectedDate || getCurrentDateISO();
    if (agentNameInput && document.activeElement !== agentNameInput) {
      agentNameInput.value = state.agentName;
    }

    addRow.classList.toggle("asn-hidden", !addMode);
    if (!addRow.classList.contains("asn-hidden")) addInput.focus();

    applyPosition();
    renderNotes();
  }

  function applyPosition() {
    const panel = get(ids.panel);
    const width = panel.offsetWidth || 360;
    const height = panel.offsetHeight || 420;
    const maxX = Math.max(0, window.innerWidth - width - 6);
    const maxY = Math.max(0, window.innerHeight - height - 6);

    let x = Number.isFinite(state.position.x) ? state.position.x : window.innerWidth - width - 24;
    let y = Number.isFinite(state.position.y) ? state.position.y : 24;
    x = clamp(x, 0, maxX);
    y = clamp(y, 0, maxY);

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
  }

  function renderNotes() {
    const list = get(ids.list);
    const empty = get(ids.empty);
    list.innerHTML = "";

    const filtered = state.notes
      .map((note, index) => ({ note, index }))
      .filter((item) => item.note.toLowerCase().includes(searchQuery.toLowerCase().trim()));
    empty.classList.toggle("asn-hidden", filtered.length > 0);

    filtered.forEach(({ note, index }) => {
      const noteEl = document.createElement("div");
      noteEl.className = "asn-note-item";

      const copyBtn = document.createElement("button");
      copyBtn.className = "asn-copy-btn";
      copyBtn.title = "Copy note";
      copyBtn.textContent = "📋";
      copyBtn.addEventListener("click", () => copyNote(note));

      const text = document.createElement("div");
      text.className = "asn-note-text";
      text.textContent = note;

      const actionWrap = document.createElement("div");
      actionWrap.className = "asn-item-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "asn-mini-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => editNote(index, note));

      const delBtn = document.createElement("button");
      delBtn.className = "asn-mini-btn";
      delBtn.textContent = "Del";
      delBtn.title = "Delete note";
      delBtn.addEventListener("click", () => deleteNote(index, note));

      actionWrap.append(editBtn, delBtn);
      noteEl.append(copyBtn, text, actionWrap);
      list.appendChild(noteEl);
    });
  }

  function buildCopyPayload(note) {
    const dateStr = getBadgeDateLabel();
    const name = (state.agentName || "").trim();
    if (name) return `${dateStr} ${name} ${note}`;
    return `${dateStr} ${note}`;
  }

  function onAgentNameInput(event) {
    state.agentName = String(event.target.value || "").slice(0, 64);
    window.clearTimeout(agentNameSaveTimer);
    agentNameSaveTimer = window.setTimeout(() => {
      agentNameSaveTimer = null;
      saveState().catch(() => {});
    }, 350);
  }

  async function copyNote(note) {
    const payload = buildCopyPayload(note);
    try {
      await navigator.clipboard.writeText(payload);
      showToast("Copied.");
    } catch (err) {
      const ok = fallbackCopy(payload);
      showToast(ok ? "Copied with fallback method." : "Clipboard copy failed.");
    }
  }

  async function onDateBadgeClick() {
    const input = get(ids.dateInput);
    input.value = state.selectedDate || getCurrentDateISO();
    input.classList.remove("asn-hidden");
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  async function onDateInputChange(event) {
    const dateValue = event.target.value;
    if (!isISODateString(dateValue)) {
      showToast("Invalid date.");
      return;
    }
    state.selectedDate = dateValue;
    await saveState();
    applyStateToUI();
    get(ids.dateInput).classList.add("asn-hidden");
    showToast(`Date set to ${getBadgeDateLabel()}.`);
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (_) {
      success = false;
    }
    ta.remove();
    return success;
  }

  function todayMMDDYYYY() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function getCurrentDateISO() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getBadgeDateLabel() {
    if (isISODateString(state.selectedDate)) {
      const [yyyy, mm, dd] = state.selectedDate.split("-");
      return `${mm}/${dd}/${yyyy}`;
    }
    return todayMMDDYYYY();
  }

  function isISODateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  async function onToggleAddMode() {
    addMode = !addMode;
    applyStateToUI();
  }

  async function onSaveNewNote() {
    const input = get(ids.addInput);
    const text = input.value.trim();
    if (!text) {
      showToast("Type a note before saving.");
      return;
    }
    state.notes.push(text);
    input.value = "";
    addMode = false;
    await saveState();
    applyStateToUI();
    showToast("Note added.");
  }

  function onSearchInput(event) {
    searchQuery = event.target.value || "";
    renderNotes();
  }

  async function onToggleTheme() {
    state.darkMode = !state.darkMode;
    await saveState();
    applyStateToUI();
  }

  async function onToggleCollapse() {
    state.collapsed = !state.collapsed;
    await saveState();
    applyStateToUI();
  }

  async function onToggleVisible() {
    state.visible = !state.visible;
    await saveState();
    applyStateToUI();
  }

  async function onToggleShortcuts() {
    state.showShortcuts = !state.showShortcuts;
    await saveState();
    applyStateToUI();
  }

  async function onHideShortcuts() {
    if (!state.showShortcuts) return;
    state.showShortcuts = false;
    await saveState();
    applyStateToUI();
  }

  async function editNote(index, currentValue) {
    const next = window.prompt("Edit note template:", currentValue);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      showToast("Note cannot be empty.");
      return;
    }
    state.notes[index] = trimmed;
    await saveState();
    renderNotes();
    showToast("Note updated.");
  }

  async function deleteNote(index, note) {
    const yes = window.confirm(`Delete this note?\n\n${note}`);
    if (!yes) return;
    state.notes.splice(index, 1);
    await saveState();
    renderNotes();
    showToast("Note deleted.");
  }

  function startDrag(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("label") ||
      target.closest("a")
    ) {
      return;
    }

    const panel = get(ids.panel);
    panel.classList.add("asn-dragging");
    const rect = panel.getBoundingClientRect();
    dragging = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", endDrag);
  }

  function onDragMove(event) {
    if (!dragging) return;
    const panel = get(ids.panel);
    const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - panel.offsetHeight);

    const x = clamp(event.clientX - dragging.offsetX, 0, maxX);
    const y = clamp(event.clientY - dragging.offsetY, 0, maxY);

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    state.position = { x, y };
  }

  async function endDrag() {
    if (!dragging) return;
    dragging = null;
    get(ids.panel).classList.remove("asn-dragging");
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", endDrag);
    await saveState();
  }

  function attachGlobalHandlers() {
    // User-configurable shortcuts for minimize and close/reopen.
    window.addEventListener("keydown", async (event) => {
      if (isTypingTarget(event.target)) return;
      if (matchesShortcut(event, state.shortcuts.toggleCollapse)) {
        event.preventDefault();
        await onToggleCollapse();
        return;
      }
      if (matchesShortcut(event, state.shortcuts.toggleVisible)) {
        event.preventDefault();
        await onToggleVisible();
      }
    });

    window.addEventListener("resize", () => {
      applyPosition();
    });

    // Close date input popover when clicking elsewhere.
    window.addEventListener("click", (event) => {
      const dateInput = get(ids.dateInput);
      const dateBtn = get(ids.dateBtn);
      if (!dateInput || !dateBtn) return;
      if (dateInput.contains(event.target) || dateBtn.contains(event.target)) return;
      dateInput.classList.add("asn-hidden");
    });
  }

  function showToast(message) {
    const toast = get(ids.toast);
    toast.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.textContent = "";
    }, 1600);
  }

  async function onShortcutCapture(event, key) {
    event.preventDefault();
    event.stopPropagation();
    const combo = eventToShortcut(event);
    if (!combo) {
      showToast("Use at least one modifier key (Ctrl/Alt/Shift).");
      return;
    }
    state.shortcuts[key] = combo;
    await saveState();
    applyStateToUI();
    showToast(`Shortcut updated: ${combo}`);
  }

  function eventToShortcut(event) {
    const modifierKeys = [];
    if (event.ctrlKey) modifierKeys.push("Ctrl");
    if (event.altKey) modifierKeys.push("Alt");
    if (event.shiftKey) modifierKeys.push("Shift");
    if (event.metaKey) modifierKeys.push("Meta");

    const ignoredCodes = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);
    if (ignoredCodes.has(event.code) || modifierKeys.length === 0) return null;

    return [...modifierKeys, formatKeyFromCode(event.code)].join("+");
  }

  function formatKeyFromCode(code) {
    if (code.startsWith("Key")) return code.slice(3).toUpperCase();
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `Numpad${code.slice(6)}`;
    const simpleMap = {
      Minus: "-",
      Equal: "=",
      BracketLeft: "[",
      BracketRight: "]",
      Backslash: "\\",
      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      Slash: "/",
      Backquote: "`",
      Space: "Space",
      Escape: "Esc"
    };
    return simpleMap[code] || code;
  }

  function matchesShortcut(event, shortcut) {
    const parsed = parseShortcut(shortcut);
    if (!parsed) return false;
    return (
      Boolean(event.ctrlKey) === parsed.ctrl &&
      Boolean(event.altKey) === parsed.alt &&
      Boolean(event.shiftKey) === parsed.shift &&
      Boolean(event.metaKey) === parsed.meta &&
      event.code === parsed.code
    );
  }

  function parseShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== "string") return null;
    const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const keyLabel = parts[parts.length - 1];
    const mods = new Set(parts.slice(0, -1));
    return {
      ctrl: mods.has("Ctrl"),
      alt: mods.has("Alt"),
      shift: mods.has("Shift"),
      meta: mods.has("Meta"),
      code: keyLabelToCode(keyLabel)
    };
  }

  function keyLabelToCode(label) {
    if (/^[A-Z]$/.test(label)) return `Key${label}`;
    if (/^[0-9]$/.test(label)) return `Digit${label}`;
    if (label.startsWith("Numpad")) return label;
    const reverseMap = {
      "-": "Minus",
      "=": "Equal",
      "[": "BracketLeft",
      "]": "BracketRight",
      "\\": "Backslash",
      ";": "Semicolon",
      "'": "Quote",
      ",": "Comma",
      ".": "Period",
      "/": "Slash",
      "`": "Backquote",
      Space: "Space",
      Esc: "Escape"
    };
    return reverseMap[label] || label;
  }

  function isTypingTarget(target) {
    if (!target) return false;
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    );
  }

  function get(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
