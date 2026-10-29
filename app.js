"use strict";

/* =========================================================
   АРБУЗНЫЙ АРХИВ
   Авторизация, заметки, таблицы Excel, импорт и экспорт
   ========================================================= */

const $ = (id) => document.getElementById(id);

const on = (id, event, callback) => {
  const element = $(id);
  if (element) element.addEventListener(event, callback);
};

const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = value ?? "";
};

const setHidden = (id, hidden) => {
  const element = $(id);
  if (element) element.classList.toggle("hidden", hidden);
};

const authMessage = () => $("authMessage") || $("message");
const appMessage = () => $("appMessage") || $("message");

let supabaseClient = null;
let currentUser = null;

let notes = [];
let sheets = [];

let editingNoteId = null;
let authMode = "login";

let currentSheet = null;
let sheetDirty = false;
let sheetRows = 15;
let sheetCols = 8;

const PAGE_NAMES = {
  home: "Главная",
  notes: "Заметки",
  sheets: "Excel-таблицы",
  history: "История",
  profile: "Профиль",
  settings: "Настройки"
};

/* -------------------- Сообщения -------------------- */

function showMessage(element, text, isError = false) {
  if (!element) return;

  element.textContent = text || "";
  element.classList.toggle("error", Boolean(isError));
}

/* -------------------- Supabase -------------------- */

function initSupabase() {
  if (supabaseClient) return true;

  if (!window.supabase?.createClient) {
    showMessage(
      authMessage(),
      "Не загрузилась библиотека Supabase. Проверь подключение к интернету.",
      true
    );
    return false;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_KEY === "undefined" ||
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    showMessage(
      authMessage(),
      "Проверь настройки Supabase в config.js.",
      true
    );
    return false;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return true;
}

/* -------------------- Авторизация -------------------- */

function setAuthMode(mode) {
  authMode = mode;

  if ($("showLoginTab")) {
    $("showLoginTab").classList.toggle("active", mode === "login");
  }

  if ($("showRegisterTab")) {
    $("showRegisterTab").classList.toggle("active", mode === "register");
  }

  setText(
    "authSubmit",
    mode === "login" ? "Войти в архив" : "Создать аккаунт"
  );

  const password = $("password");

  if (password) {
    password.autocomplete =
      mode === "login" ? "current-password" : "new-password";
  }

  showMessage(
    authMessage(),
    mode === "login"
      ? "Войди в свой архив."
      : "После регистрации может потребоваться подтверждение почты."
  );
}

function showApp(user) {
  currentUser = user;

  setHidden("authView", true);
  setHidden("auth", true);
  setHidden("appView", false);
  setHidden("cabinet", false);

  const email = user?.email || "Пользователь";

  setText("profileEmail", email);
  setText("settingsEmail", email);
  setText("sidebarEmail", email);
  setText("userEmail", `Ты вошёл как: ${email}`);
  setText("avatarInitials", email.charAt(0).toUpperCase());

  setPage("home");

  // Функции сами проверят, авторизован ли пользователь.
  loadNotes();
  loadSheets();
}

function showAuth() {
  currentUser = null;
  notes = [];
  sheets = [];
  currentSheet = null;
  sheetDirty = false;

  setHidden("authView", false);
  setHidden("auth", false);
  setHidden("appView", true);
  setHidden("cabinet", true);

  resetNoteEditor();
  renderNotes();
  renderSheets();
}

async function authenticate() {
  if (!initSupabase()) return;

  const email = $("email")?.value.trim() || "";
  const password = $("password")?.value || "";

  if (!email || password.length < 6) {
    showMessage(
      authMessage(),
      "Введи почту и пароль минимум из 6 символов.",
      true
    );
    return;
  }

  const submit = $("authSubmit");
  const login = $("loginButton");
  const register = $("registerButton");

  if (submit) submit.disabled = true;
  if (login) login.disabled = true;
  if (register) register.disabled = true;

  showMessage(
    authMessage(),
    authMode === "login"
      ? "Выполняем вход..."
      : "Создаём аккаунт..."
  );

  try {
    if (authMode === "login") {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      if (data.user) {
        showApp(data.user);
      } else {
        showMessage(authMessage(), "Не удалось получить данные аккаунта.", true);
      }
    } else {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (data.session && data.user) {
        showApp(data.user);
      } else {
        setAuthMode("login");

        showMessage(
          authMessage(),
          "Аккаунт создан. Проверь почту, подтверди регистрацию и затем войди."
        );
      }
    }
  } catch (error) {
    console.error("Ошибка авторизации:", error);

    showMessage(
      authMessage(),
      `Не удалось выполнить действие: ${error.message}`,
      true
    );
  } finally {
    if (submit) submit.disabled = false;
    if (login) login.disabled = false;
    if (register) register.disabled = false;
  }
}

async function logout() {
  if (!initSupabase()) return;

  if (
    sheetDirty &&
    !window.confirm(
      "В таблице есть несохранённые изменения. Выйти без сохранения?"
    )
  ) {
    return;
  }

  const button = $("logoutButton");

  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    showAuth();

    showMessage(
      authMessage(),
      "Ты вышел из аккаунта."
    );
  } catch (error) {
    showMessage(
      appMessage(),
      `Не удалось выйти: ${error.message}`,
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* -------------------- Навигация -------------------- */

function setPage(pageName) {
  const pageIds = {
    home: ["page-home", "archiveHome"],
    notes: ["page-notes", "archiveNotes"],
    sheets: ["page-sheets"],
    history: ["page-history", "archiveHistory"],
    profile: ["page-profile", "archiveProfile"],
    settings: ["page-settings", "archiveSettings"]
  };

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
    page.classList.add("hidden");
  });

  for (const id of pageIds[pageName] || []) {
    const page = $(id);
    if (page) {
      page.classList.remove("hidden");
      page.classList.add("active");
    }
  }

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  setText("breadcrumbCurrent", PAGE_NAMES[pageName] || pageName);
}

/* -------------------- Безопасность и форматирование -------------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "Дата неизвестна";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Дата неизвестна";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function pluralNotes(number) {
  const lastTwo = number % 100;
  const last = number % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "заметок";
  if (last === 1) return "заметка";
  if (last >= 2 && last <= 4) return "заметки";

  return "заметок";
}

function renderList(container, items, emptyText, renderItem) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">⌁</span>
        ${escapeHTML(emptyText)}
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(renderItem).join("");
}

/* =========================================================
   ЗАМЕТКИ
   ========================================================= */

function resetNoteEditor() {
  editingNoteId = null;

  if ($("noteForm")) {
    $("noteForm").reset();
  }

  // Старый вариант HTML использует textarea с id="note".
  if ($("note")) $("note").value = "";

  setText("editorHeading", "Новая заметка");
  setText("saveButton", "Сохранить заметку");

  setHidden("cancelEdit", true);

  if ($("saveButton")) $("saveButton").disabled = false;
}

function noteCard(note) {
  const id = escapeHTML(note.id);

  return `
    <article class="note-card">
      <div class="card-top">
        <div class="card-symbol">▤</div>
        <button class="btn ghost small"
                type="button"
                data-edit-note="${id}">
          Изменить
        </button>
      </div>

      <h4>${escapeHTML(note.title || "Без названия")}</h4>

      <p class="note-content">${
        escapeHTML(note.encrypted_content || "")
      }</p>

      <div class="card-meta">
        <span>${
          escapeHTML(formatDate(note.updated_at || note.created_at))
        }</span>

        <button class="btn danger small"
                type="button"
                data-delete-note="${id}">
          Удалить
        </button>
      </div>
    </article>
  `;
}

function renderNotes() {
  const search = $("notesSearch");
  const query = search
    ? search.value.trim().toLocaleLowerCase("ru")
    : "";

  const filtered = notes.filter((note) => {
    const text = `${note.title || ""} ${note.encrypted_content || ""}`;
    return text.toLocaleLowerCase("ru").includes(query);
  });

  renderList(
    $("notesList"),
    filtered,
    query ? "Ничего не найдено." : "Здесь пока пусто. Создай первую заметку.",
    noteCard
  );

  renderList(
    $("recentNotes"),
    notes.slice(0, 4),
    "Здесь появятся недавно сохранённые заметки.",
    noteCard
  );

  renderList(
    $("historyList"),
    notes,
    "История пока пуста.",
    noteCard
  );

  setText("homeNoteCount", notes.length);
  setText("notesCount", notes.length);
  setText("notesTotal", `${notes.length} ${pluralNotes(notes.length)}`);
  setText("profileNoteCount", notes.length);

  updateRecentCount();
}

async function loadNotes() {
  if (!supabaseClient || !currentUser) return;

  showMessage(appMessage(), "Загружаем заметки...");

  try {
    const { data, error } = await supabaseClient
      .from("notes")
      .select("id,user_id,title,encrypted_content,created_at,updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    notes = data || [];
    renderNotes();

    showMessage(appMessage(), `Заметки загружены: ${notes.length}.`);
  } catch (error) {
    console.error("Ошибка загрузки заметок:", error);

    showMessage(
      appMessage(),
      `Не удалось загрузить заметки: ${error.message}`,
      true
    );
  }
}

async function saveNote(event) {
  if (event) event.preventDefault();

  if (!supabaseClient || !currentUser) {
    showMessage(appMessage(), "Сначала войди в аккаунт.", true);
    return;
  }

  const title = $("noteTitle")?.value.trim() || "";
  const content =
    $("noteContent")?.value.trim() ||
    $("note")?.value.trim() ||
    "";

  if (!title || !content) {
    showMessage(
      appMessage(),
      "Заполни название и текст заметки.",
      true
    );
    return;
  }

  const wasEditing = Boolean(editingNoteId);

  const payload = {
    title,
    encrypted_content: content,
    updated_at: new Date().toISOString()
  };

  const button = $("saveButton");
  if (button) button.disabled = true;

  showMessage(
    appMessage(),
    wasEditing ? "Обновляем заметку..." : "Сохраняем заметку..."
  );

  try {
    let result;

    if (editingNoteId) {
      result = await supabaseClient
        .from("notes")
        .update(payload)
        .eq("id", editingNoteId)
        .eq("user_id", currentUser.id)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("notes")
        .insert({
          ...payload,
          user_id: currentUser.id
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    resetNoteEditor();

    await loadNotes();
    setPage("notes");

    showMessage(
      appMessage(),
      wasEditing ? "Заметка обновлена." : "Заметка сохранена."
    );
  } catch (error) {
    console.error("Ошибка сохранения заметки:", error);

    showMessage(
      appMessage(),
      `Не удалось сохранить заметку: ${error.message}`,
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

function editNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;

  editingNoteId = id;

  if ($("noteTitle")) $("noteTitle").value = note.title || "";

  const contentField = $("noteContent") || $("note");

  if (contentField) {
    contentField.value = note.encrypted_content || "";
  }

  setText("editorHeading", "Редактирование заметки");
  setText("saveButton", "Сохранить изменения");
  setHidden("cancelEdit", false);

  setPage("notes");

  if ($("noteTitle")) $("noteTitle").focus();
}

async function deleteNote(id) {
  const note = notes.find((item) => item.id === id);

  if (
    !note ||
    !window.confirm(`Удалить заметку «${note.title || "Без названия"}»?`)
  ) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    if (editingNoteId === id) resetNoteEditor();

    await loadNotes();

    showMessage(appMessage(), "Заметка удалена.");
  } catch (error) {
    showMessage(
      appMessage(),
      `Не удалось удалить заметку: ${error.message}`,
      true
    );
  }
}

/* =========================================================
   EXCEL-ТАБЛИЦЫ
   ========================================================= */

function columnLabel(index) {
  let number = index + 1;
  let label = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - 1) / 26);
  }

  return label;
}

function makeEmptyGrid(rows = 15, cols = 8) {
  return Array.from(
    { length: rows },
    () => Array(cols).fill("")
  );
}

function normalizeGrid(input) {
  if (!Array.isArray(input)) {
    return makeEmptyGrid();
  }

  const data = input.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => cell == null ? "" : String(cell))
      : []
  );

  const rows = Math.max(15, data.length);
  const cols = Math.max(8, ...data.map((row) => row.length));

  if (rows > 300) {
    throw new Error("Максимальный размер — 300 строк.");
  }

  if (cols > 40) {
    throw new Error("Максимальный размер — 40 столбцов.");
  }

  return Array.from({ length: rows }, (_, r) => {
    const row = data[r] || [];

    return Array.from(
      { length: cols },
      (_, c) => row[c] ?? ""
    );
  });
}

function sheetCard(sheet) {
  const id = escapeHTML(sheet.id);
  const data = Array.isArray(sheet.sheet_data)
    ? sheet.sheet_data
    : [];

  const preview = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      preview.push(
        `<span>${escapeHTML((data[r] && data[r][c]) || "")}</span>`
      );
    }
  }

  return `
    <article class="sheet-card">
      <div class="card-top">
        <div class="card-symbol">▦</div>

        <button class="btn danger small"
                type="button"
                data-delete-sheet="${id}">
          Удалить
        </button>
      </div>

      <h4>${escapeHTML(sheet.name || "Без названия")}</h4>

      <p class="note-content">
        Таблица · ${escapeHTML(formatDate(sheet.updated_at || sheet.created_at))}
      </p>

      <div class="sheet-preview">
        <div class="mini-grid">${preview.join("")}</div>
      </div>

      <div class="card-meta">
        <span>Excel-таблица</span>

        <button class="btn secondary small"
                type="button"
                data-open-sheet="${id}">
          Открыть →
        </button>
      </div>
    </article>
  `;
}

function renderSheets() {
  const search = $("sheetsSearch");
  const query = search
    ? search.value.trim().toLocaleLowerCase("ru")
    : "";

  const filtered = sheets.filter((sheet) =>
    (sheet.name || "").toLocaleLowerCase("ru").includes(query)
  );

  renderList(
    $("sheetsList"),
    filtered,
    query ? "Таблицы не найдены." : "Создай свою первую Excel-таблицу.",
    sheetCard
  );

  renderList(
    $("recentSheets"),
    sheets.slice(0, 2),
    "Твои таблицы будут отображаться здесь.",
    sheetCard
  );

  setText("homeSheetCount", sheets.length);
  setText("profileSheetCount", sheets.length);

  updateRecentCount();
}

async function loadSheets() {
  if (!supabaseClient || !currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("sheets")
      .select("id,user_id,name,sheet_data,created_at,updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    sheets = data || [];
    renderSheets();
  } catch (error) {
    console.error("Ошибка загрузки таблиц:", error);

    renderSheets();

    showMessage(
      appMessage(),
      `Не удалось загрузить таблицы. Проверь SQL для Supabase. ${error.message}`,
      true
    );
  }
}

async function createSheet() {
  if (!supabaseClient || !currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("sheets")
      .insert({
        user_id: currentUser.id,
        name: "Новая таблица",
        sheet_data: makeEmptyGrid()
      })
      .select("id,user_id,name,sheet_data,created_at,updated_at")
      .single();

    if (error) throw error;

    sheets.unshift(data);
    renderSheets();
    openSheet(data);

    showMessage(
      $("sheetMessage"),
      "Таблица создана. Введи данные и нажми «Сохранить»."
    );
  } catch (error) {
    showMessage(
      appMessage(),
      `Не удалось создать таблицу: ${error.message}. Проверь создание таблицы sheets в Supabase.`,
      true
    );
  }
}

function openSheet(sheet) {
  if (currentSheet && sheetDirty) {
    const confirmed = window.confirm(
      "Есть несохранённые изменения. Открыть другую таблицу без сохранения?"
    );

    if (!confirmed) return;
  }

  currentSheet = {
    ...sheet,
    name: sheet.name || "Новая таблица",
    sheet_data: normalizeGrid(sheet.sheet_data)
  };

  sheetRows = currentSheet.sheet_data.length;
  sheetCols = currentSheet.sheet_data[0].length;
  sheetDirty = false;

  setHidden("sheetListView", true);
  setHidden("sheetEditorView", false);

  setText("sheetPageHeading", currentSheet.name);

  if ($("sheetNameInput")) {
    $("sheetNameInput").value = currentSheet.name;
  }

  setText("sheetStatus", "Сохранено");

  setPage("sheets");
  renderGrid();
}

function closeSheetEditor() {
  if (
    sheetDirty &&
    !window.confirm("Есть несохранённые изменения. Закрыть без сохранения?")
  ) {
    return;
  }

  currentSheet = null;
  sheetDirty = false;

  setHidden("sheetEditorView", true);
  setHidden("sheetListView", false);

  renderSheets();
}

function markSheetDirty() {
  sheetDirty = true;
  setText("sheetStatus", "Есть несохранённые изменения");
}

function renderGrid() {
  if (!currentSheet || !$("spreadsheetGrid")) return;

  let html = "<thead><tr><th class='row-head'>#</th>";

  for (let c = 0; c < sheetCols; c++) {
    html += `<th>${columnLabel(c)}</th>`;
  }

  html += "</tr></thead><tbody>";

  for (let r = 0; r < sheetRows; r++) {
    html += `<tr><th class="row-head">${r + 1}</th>`;

    for (let c = 0; c < sheetCols; c++) {
      const value = escapeHTML(currentSheet.sheet_data[r]?.[c] ?? "");

      html += `
        <td>
          <input type="text"
                 data-cell-row="${r}"
                 data-cell-col="${c}"
                 value="${value}"
                 aria-label="${columnLabel(c)}${r + 1}">
        </td>
      `;
    }

    html += "</tr>";
  }

  html += "</tbody>";

  $("spreadsheetGrid").innerHTML = html;

  setText(
    "sheetDimensions",
    `${sheetRows} строк · ${sheetCols} столбцов`
  );
}

async function saveCurrentSheet() {
  if (!currentSheet || !currentUser || !supabaseClient) return;

  const name = $("sheetNameInput")?.value.trim() || "Без названия";

  currentSheet.name = name;

  const button = $("saveSheetButton");
  if (button) button.disabled = true;

  setText("sheetStatus", "Сохраняем...");
  showMessage($("sheetMessage"), "Сохраняем таблицу...");

  try {
    const { data, error } = await supabaseClient
      .from("sheets")
      .update({
        name,
        sheet_data: currentSheet.sheet_data,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentSheet.id)
      .eq("user_id", currentUser.id)
      .select("id,user_id,name,sheet_data,created_at,updated_at")
      .single();

    if (error) throw error;

    currentSheet = {
      ...data,
      sheet_data: normalizeGrid(data.sheet_data)
    };

    sheetRows = currentSheet.sheet_data.length;
    sheetCols = currentSheet.sheet_data[0].length;
    sheetDirty = false;

    if ($("sheetNameInput")) {
      $("sheetNameInput").value = currentSheet.name;
    }

    setText("sheetPageHeading", currentSheet.name);
    setText("sheetStatus", "Сохранено");

    const index = sheets.findIndex(
      (item) => item.id === currentSheet.id
    );

    if (index >= 0) {
      sheets[index] = data;
    } else {
      sheets.unshift(data);
    }

    sheets.sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at) -
        new Date(a.updated_at || a.created_at)
    );

    renderSheets();

    showMessage(
      $("sheetMessage"),
      "Таблица сохранена в твоём аккаунте."
    );
  } catch (error) {
    console.error("Ошибка сохранения таблицы:", error);

    setText("sheetStatus", "Ошибка сохранения");

    showMessage(
      $("sheetMessage"),
      `Не удалось сохранить таблицу: ${error.message}`,
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

function addRow() {
  if (!currentSheet) return;

  if (sheetRows >= 300) {
    showMessage($("sheetMessage"), "Лимит — 300 строк.", true);
    return;
  }

  currentSheet.sheet_data.push(Array(sheetCols).fill(""));
  sheetRows++;

  markSheetDirty();
  renderGrid();
}

function addColumn() {
  if (!currentSheet) return;

  if (sheetCols >= 40) {
    showMessage($("sheetMessage"), "Лимит — 40 столбцов.", true);
    return;
  }

  currentSheet.sheet_data.forEach((row) => row.push(""));
  sheetCols++;

  markSheetDirty();
  renderGrid();
}

function removeLastRow() {
  if (!currentSheet || sheetRows <= 1) return;

  if (!window.confirm("Удалить последнюю строку?")) return;

  currentSheet.sheet_data.pop();
  sheetRows--;

  markSheetDirty();
  renderGrid();
}

function removeLastColumn() {
  if (!currentSheet || sheetCols <= 1) return;

  if (!window.confirm("Удалить последний столбец?")) return;

  currentSheet.sheet_data.forEach((row) => row.pop());
  sheetCols--;

  markSheetDirty();
  renderGrid();
}

async function deleteSheet(id) {
  const sheet = sheets.find((item) => item.id === id);
  if (!sheet) return;

  if (!window.confirm(`Удалить таблицу «${sheet.name || "Без названия"}»?`)) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("sheets")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    sheets = sheets.filter((item) => item.id !== id);

    if (currentSheet?.id === id) {
      currentSheet = null;
      sheetDirty = false;

      setHidden("sheetEditorView", true);
      setHidden("sheetListView", false);
    }

    renderSheets();

    showMessage(appMessage(), "Таблица удалена.");
  } catch (error) {
    showMessage(
      appMessage(),
      `Не удалось удалить таблицу: ${error.message}`,
      true
    );
  }
}

/* -------------------- Excel: импорт и экспорт -------------------- */

function safeFilename(name) {
  return (name || "таблица")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 80) || "таблица";
}

function getExportData() {
  if (!currentSheet) return [];

  return currentSheet.sheet_data.map((row) =>
    row.map((cell) => cell ?? "")
  );
}

function exportXlsx() {
  if (!currentSheet) return;

  if (!window.XLSX) {
    showMessage(
      $("sheetMessage"),
      "Excel-библиотека не загрузилась. Проверь интернет.",
      true
    );
    return;
  }

  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet(getExportData());

  window.XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Лист 1"
  );

  window.XLSX.writeFile(
    workbook,
    `${safeFilename(currentSheet.name)}.xlsx`
  );

  showMessage($("sheetMessage"), "Файл XLSX скачан.");
}

function exportCsv() {
  if (!currentSheet) return;

  const csv = getExportData().map((row) =>
    row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${safeFilename(currentSheet.name)}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showMessage($("sheetMessage"), "CSV-файл скачан.");
}

async function importSpreadsheet(file) {
  if (!currentSheet || !file) return;

  if (!window.XLSX) {
    showMessage(
      $("sheetMessage"),
      "Excel-библиотека не загрузилась. Проверь интернет.",
      true
    );
    return;
  }

  try {
    const buffer = await file.arrayBuffer();

    const workbook = window.XLSX.read(buffer, {
      type: "array"
    });

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("В файле нет листов.");
    }

    const imported = window.XLSX.utils.sheet_to_json(
      workbook.Sheets[firstSheetName],
      {
        header: 1,
        defval: "",
        raw: false
      }
    );

    if (!imported.length) {
      throw new Error("Таблица в файле пустая.");
    }

    currentSheet.sheet_data = normalizeGrid(imported);

    sheetRows = currentSheet.sheet_data.length;
    sheetCols = currentSheet.sheet_data[0].length;

    markSheetDirty();
    renderGrid();

    showMessage(
      $("sheetMessage"),
      "Файл импортирован. Нажми «Сохранить», чтобы записать изменения."
    );
  } catch (error) {
    showMessage(
      $("sheetMessage"),
      `Ошибка импорта: ${error.message}`,
      true
    );
  } finally {
    if ($("importSheetInput")) {
      $("importSheetInput").value = "";
    }
  }
}

/* -------------------- Подключение кнопок -------------------- */

// Современная форма входа.
on("authForm", "submit", authenticate);

// Совместимость со старым HTML, где отдельные кнопки.
on("loginButton", "click", () => {
  setAuthMode("login");
  authenticate();
});

on("registerButton", "click", () => {
  setAuthMode("register");
  authenticate();
});

on("showLoginTab", "click", () => setAuthMode("login"));
on("showRegisterTab", "click", () => setAuthMode("register"));
on("logoutButton", "click", logout);

on("noteForm", "submit", saveNote);

// Для старого интерфейса без формы.
if (!$("noteForm")) {
  on("saveButton", "click", saveNote);
}

on("cancelEdit", "click", resetNoteEditor);
on("notesSearch", "input", renderNotes);
on("sheetsSearch", "input", renderSheets);

on("newNoteButton", "click", () => {
  resetNoteEditor();
  setPage("notes");
});

on("topNewNote", "click", () => {
  resetNoteEditor();
  setPage("notes");
});

on("newNoteButton", "click", () => {
  if ($("noteTitle")) $("noteTitle").focus();
});

on("refreshButton", "click", async () => {
  await Promise.all([loadNotes(), loadSheets()]);
});

on("homeNewSheet", "click", async () => {
  setPage("sheets");
  await createSheet();
});

on("createSheetButton", "click", createSheet);
on("backToSheets", "click", closeSheetEditor);
on("saveSheetButton", "click", saveCurrentSheet);

on("addRowButton", "click", addRow);
on("addColButton", "click", addColumn);
on("deleteRowButton", "click", removeLastRow);
on("deleteColButton", "click", removeLastColumn);

on("exportXlsxButton", "click", exportXlsx);
on("exportCsvButton", "click", exportCsv);

on("importSheetInput", "change", (event) => {
  importSpreadsheet(event.target.files?.[0]);
});

on("sheetNameInput", "input", () => {
  if (!currentSheet) return;

  currentSheet.name = $("sheetNameInput").value;
  setText("sheetPageHeading", currentSheet.name || "Без названия");

  markSheetDirty();
});

on("spreadsheetGrid", "input", (event) => {
  const input = event.target.closest("[data-cell-row]");

  if (!input || !currentSheet) return;

  const row = Number(input.dataset.cellRow);
  const col = Number(input.dataset.cellCol);

  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    !currentSheet.sheet_data[row]
  ) {
    return;
  }

  currentSheet.sheet_data[row][col] = input.value;
  input.classList.add("changed");

  markSheetDirty();
});

/* Делегирование событий: карточки заметок и таблиц. */
document.addEventListener("click", (event) => {
  const editNoteButton = event.target.closest("[data-edit-note]");
  const deleteNoteButton = event.target.closest("[data-delete-note]");
  const openSheetButton = event.target.closest("[data-open-sheet]");
  const deleteSheetButton = event.target.closest("[data-delete-sheet]");
  const navButton = event.target.closest(".nav-btn");
  const goButton = event.target.closest("[data-go]");

  if (editNoteButton) {
    editNote(editNoteButton.dataset.editNote);
    return;
  }

  if (deleteNoteButton) {
    deleteNote(deleteNoteButton.dataset.deleteNote);
    return;
  }

  if (deleteSheetButton) {
    deleteSheet(deleteSheetButton.dataset.deleteSheet);
    return;
  }

  if (openSheetButton) {
    const sheet = sheets.find(
      (item) => item.id === openSheetButton.dataset.openSheet
    );

    if (sheet) openSheet(sheet);
    return;
  }

  if (navButton) {
    const destination = navButton.dataset.page;

    if (
      currentSheet &&
      sheetDirty &&
      destination !== "sheets" &&
      !window.confirm("Есть несохранённые изменения. Перейти без сохранения?")
    ) {
      return;
    }

    setPage(destination);
    return;
  }

  if (goButton) {
    const destination = goButton.dataset.go;

    if (
      currentSheet &&
      sheetDirty &&
      !window.confirm("Есть несохранённые изменения. Перейти без сохранения?")
    ) {
      return;
    }

    currentSheet = null;
    sheetDirty = false;

    setHidden("sheetEditorView", true);
    setHidden("sheetListView", false);

    setPage(destination);
  }
});

/* -------------------- Главная и статистика -------------------- */

function updateRecentCount() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const recentNotes = notes.filter((note) => {
    const time = new Date(note.updated_at || note.created_at).getTime();
    return Number.isFinite(time) && time >= weekAgo;
  }).length;

  const recentSheets = sheets.filter((sheet) => {
    const time = new Date(sheet.updated_at || sheet.created_at).getTime();
    return Number.isFinite(time) && time >= weekAgo;
  }).length;

  setText("homeRecentCount", recentNotes + recentSheets);
}

/* -------------------- Старт -------------------- */

async function startApp() {
  if (!initSupabase()) return;

  showMessage(authMessage(), "Проверяем вход...");

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      showApp(data.session.user);
    } else {
      showAuth();
    }
  } catch (error) {
    console.error("Ошибка запуска:", error);

    showAuth();

    showMessage(
      authMessage(),
      `Не удалось проверить вход: ${error.message}`,
      true
    );
  }
}

startApp();
