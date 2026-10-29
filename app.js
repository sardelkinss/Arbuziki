"use strict";

const $ = (id) => document.getElementById(id);

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

const pageNames = {
  home: "Главная",
  notes: "Заметки",
  sheets: "Excel-таблицы",
  history: "История",
  profile: "Профиль",
  settings: "Настройки"
};

function showMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text || "";
  element.classList.toggle("error", Boolean(isError));
}

function initSupabase() {
  if (supabaseClient) return true;

  if (!window.supabase || !window.supabase.createClient) {
    showMessage($("authMessage"), "Не загрузилась библиотека Supabase. Проверь интернет.", true);
    return false;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_KEY === "undefined" ||
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    showMessage($("authMessage"), "Проверь настройки Supabase в config.js.", true);
    return false;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return true;
}

// -------------------- Авторизация --------------------

function setAuthMode(mode) {
  authMode = mode;

  $("showLoginTab").classList.toggle("active", mode === "login");
  $("showRegisterTab").classList.toggle("active", mode === "register");

  $("authSubmit").textContent =
    mode === "login" ? "Войти в архив" : "Создать аккаунт";

  $("password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

  showMessage(
    $("authMessage"),
    mode === "login"
      ? "Войди в свой архив."
      : "После регистрации может понадобиться подтверждение почты."
  );
}

function showApp(user) {
  currentUser = user;

  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  const email = user.email || "Пользователь";

  $("profileEmail").textContent = email;
  $("settingsEmail").textContent = email;
  $("sidebarEmail").textContent = email;
  $("avatarInitials").textContent = email.slice(0, 1).toUpperCase();

  setPage("home");
  loadNotes();
  loadSheets();
}

function showAuth() {
  currentUser = null;
  notes = [];
  sheets = [];
  currentSheet = null;
  sheetDirty = false;

  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");

  resetNoteEditor();
  renderNotes();
  renderSheets();
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!initSupabase()) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || password.length < 6) {
    showMessage(
      $("authMessage"),
      "Введи почту и пароль минимум из 6 символов.",
      true
    );
    return;
  }

  const button = $("authSubmit");
  button.disabled = true;

  showMessage(
    $("authMessage"),
    authMode === "login" ? "Выполняем вход..." : "Создаём аккаунт..."
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
        showMessage($("authMessage"), "Не удалось получить данные пользователя.", true);
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
          $("authMessage"),
          "Аккаунт создан. Проверь почту, подтверди регистрацию и затем войди."
        );
      }
    }
  } catch (error) {
    console.error("Ошибка авторизации:", error);
    showMessage(
      $("authMessage"),
      `Не удалось выполнить действие: ${error.message}`,
      true
    );
  } finally {
    button.disabled = false;
  }
});

$("showLoginTab").addEventListener("click", () => setAuthMode("login"));
$("showRegisterTab").addEventListener("click", () => setAuthMode("register"));

$("logoutButton").addEventListener("click", async () => {
  if (!initSupabase()) return;

  if (
    sheetDirty &&
    !window.confirm("В таблице есть несохранённые изменения. Выйти без сохранения?")
  ) {
    return;
  }

  $("logoutButton").disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    showAuth();
    showMessage($("authMessage"), "Ты вышел из аккаунта.");
  } catch (error) {
    showMessage($("appMessage"), `Не удалось выйти: ${error.message}`, true);
  } finally {
    $("logoutButton").disabled = false;
  }
});

async function startApp() {
  if (!initSupabase()) return;

  showMessage($("authMessage"), "Проверяем вход...");

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (data.session && data.session.user) {
      showApp(data.session.user);
    } else {
      showAuth();
    }
  } catch (error) {
    console.error("Ошибка запуска:", error);
    showAuth();
    showMessage(
      $("authMessage"),
      `Не удалось проверить сессию: ${error.message}`,
      true
    );
  }
}

// -------------------- Общие функции --------------------

function setPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageName}`);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  $("breadcrumbCurrent").textContent = pageNames[pageName] || pageName;
}

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
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";

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

  $("homeRecentCount").textContent = recentNotes + recentSheets;
}

function renderList(container, items, emptyText, renderCard) {
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

  container.innerHTML = items.map(renderCard).join("");
}

// -------------------- Заметки --------------------

function resetNoteEditor() {
  editingNoteId = null;

  if ($("noteForm")) $("noteForm").reset();

  if ($("editorHeading")) {
    $("editorHeading").textContent = "Новая заметка";
  }

  if ($("saveButton")) {
    $("saveButton").textContent = "Сохранить заметку";
    $("saveButton").disabled = false;
  }

  if ($("cancelEdit")) {
    $("cancelEdit").classList.add("hidden");
  }
}

function noteCard(note) {
  const id = escapeHTML(note.id);

  return `
    <article class="note-card">
      <div class="card-top">
        <div class="card-symbol">▤</div>
        <div class="card-menu">
          <button class="btn ghost small" type="button" data-edit-note="${id}">
            Изменить
          </button>
        </div>
      </div>

      <h4>${escapeHTML(note.title || "Без названия")}</h4>
      <p class="note-content">${escapeHTML(note.encrypted_content || "")}</p>

      <div class="card-meta">
        <span>${escapeHTML(formatDate(note.updated_at || note.created_at))}</span>
        <button class="btn danger small" type="button" data-delete-note="${id}">
          Удалить
        </button>
      </div>
    </article>
  `;
}

function renderNotes() {
  const query = $("notesSearch")
    ? $("notesSearch").value.trim().toLocaleLowerCase("ru")
    : "";

  const filtered = notes.filter((note) => {
    const text = `${note.title || ""} ${note.encrypted_content || ""}`;
    return text.toLocaleLowerCase("ru").includes(query);
  });

  renderList(
    $("notesList"),
    filtered,
    query ? "Ничего не найдено. Попробуй другой запрос." : "Здесь пока пусто. Создай первую заметку.",
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

  $("homeNoteCount").textContent = notes.length;
  $("notesTotal").textContent = `${notes.length} ${pluralNotes(notes.length)}`;
  $("profileNoteCount").textContent = notes.length;

  updateRecentCount();
}

async function loadNotes() {
  if (!supabaseClient || !currentUser) return;

  showMessage($("appMessage"), "Загружаем заметки...");

  try {
    const { data, error } = await supabaseClient
      .from("notes")
      .select("id,user_id,title,encrypted_content,created_at,updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    notes = data || [];
    renderNotes();

    showMessage($("appMessage"), `Заметки загружены: ${notes.length}.`);
  } catch (error) {
    console.error("Ошибка загрузки заметок:", error);
    showMessage(
      $("appMessage"),
      `Не удалось загрузить заметки: ${error.message}`,
      true
    );
  }
}

async function saveNote(event) {
  event.preventDefault();

  if (!supabaseClient || !currentUser) {
    showMessage($("appMessage"), "Сначала войди в аккаунт.", true);
    return;
  }

  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    showMessage($("appMessage"), "Заполни название и текст заметки.", true);
    return;
  }

  const wasEditing = Boolean(editingNoteId);

  const payload = {
    title,
    encrypted_content: content,
    updated_at: new Date().toISOString()
  };

  $("saveButton").disabled = true;
  showMessage($("appMessage"), wasEditing ? "Обновляем заметку..." : "Сохраняем заметку...");

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
        .insert({ ...payload, user_id: currentUser.id })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    resetNoteEditor();
    await loadNotes();
    setPage("notes");

    showMessage(
      $("appMessage"),
      wasEditing ? "Заметка обновлена." : "Заметка сохранена."
    );
  } catch (error) {
    console.error("Ошибка сохранения заметки:", error);

    showMessage(
      $("appMessage"),
      `Не удалось сохранить заметку: ${error.message}`,
      true
    );
  } finally {
    $("saveButton").disabled = false;
  }
}

function editNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;

  editingNoteId = id;
  $("noteTitle").value = note.title || "";
  $("noteContent").value = note.encrypted_content || "";

  $("editorHeading").textContent = "Редактирование заметки";
  $("saveButton").textContent = "Сохранить изменения";
  $("cancelEdit").classList.remove("hidden");

  setPage("notes");
  $("noteTitle").focus();
}

async function deleteNote(id) {
  const note = notes.find((item) => item.id === id);

  if (!note || !window.confirm(`Удалить заметку «${note.title || "Без названия"}»?`)) {
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
    showMessage($("appMessage"), "Заметка удалена.");
  } catch (error) {
    showMessage(
      $("appMessage"),
      `Не удалось удалить заметку: ${error.message}`,
      true
    );
  }
}

// -------------------- Excel-таблицы --------------------

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
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

function normalizeGrid(input) {
  const data = Array.isArray(input)
    ? input.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => cell == null ? "" : String(cell))
          : []
      )
    : [];

  const cols = Math.max(8, ...data.map((row) => row.length));
  const rows = Math.max(15, data.length);

  if (rows > 300) {
    throw new Error("Максимальный размер листа в этой версии — 300 строк.");
  }

  if (cols > 40) {
    throw new Error("Максимальный размер листа в этой версии — 40 столбцов.");
  }

  return Array.from({ length: rows }, (_, r) => {
    const row = data[r] || [];
    return Array.from({ length: cols }, (_, c) => row[c] ?? "");
  });
}

function sheetCard(sheet) {
  const id = escapeHTML(sheet.id);
  const data = Array.isArray(sheet.sheet_data) ? sheet.sheet_data : [];
  const preview = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      preview.push(`<span>${escapeHTML((data[r] && data[r][c]) || "")}</span>`);
    }
  }

  return `
    <article class="sheet-card">
      <div class="card-top">
        <div class="card-symbol">▦</div>
        <button class="btn danger small" type="button" data-delete-sheet="${id}">
          Удалить
        </button>
      </div>

      <h4>${escapeHTML(sheet.name || "Без названия")}</h4>
      <p class="note-content">Таблица · ${escapeHTML(formatDate(sheet.updated_at || sheet.created_at))}</p>

      <div class="sheet-preview">
        <div class="mini-grid">${preview.join("")}</div>
      </div>

      <div class="card-meta">
        <span>Excel-таблица</span>
        <button class="btn secondary small" type="button" data-open-sheet="${id}">
          Открыть →
        </button>
      </div>
    </article>
  `;
}

function renderSheets() {
  const query = $("sheetsSearch")
    ? $("sheetsSearch").value.trim().toLocaleLowerCase("ru")
    : "";

  const filtered = sheets.filter((sheet) =>
    (sheet.name || "").toLocaleLowerCase("ru").includes(query)
  );

  renderList(
    $("sheetsList"),
    filtered,
    query ? "Таблицы не найдены." : "Здесь пока нет таблиц. Создай первую Excel-таблицу.",
    sheetCard
  );

  renderList(
    $("recentSheets"),
    sheets.slice(0, 2),
    "Твои таблицы будут отображаться здесь.",
    sheetCard
  );

  $("homeSheetCount").textContent = sheets.length;
  $("profileSheetCount").textContent = sheets.length;

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
      $("appMessage"),
      `Не удалось загрузить таблицы. Проверь, что выполнен supabase_tables.sql. Подробности: ${error.message}`,
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
      "Таблица создана. Добавь данные и нажми «Сохранить»."
    );
  } catch (error) {
    console.error("Ошибка создания таблицы:", error);

    showMessage(
      $("appMessage"),
      `Не удалось создать таблицу: ${error.message}. Проверь SQL-файл для Supabase.`,
      true
    );
  }
}

function openSheet(sheet) {
  if (
    currentSheet &&
    sheetDirty &&
    !window.confirm("В таблице есть несохранённые изменения. Открыть другую таблицу?")
  ) {
    return;
  }

  currentSheet = {
    ...sheet,
    name: sheet.name || "Новая таблица",
    sheet_data: normalizeGrid(sheet.sheet_data)
  };

  sheetRows = currentSheet.sheet_data.length;
  sheetCols = currentSheet.sheet_data[0].length;
  sheetDirty = false;

  $("sheetListView").classList.add("hidden");
  $("sheetEditorView").classList.remove("hidden");
  $("sheetPageHeading").textContent = currentSheet.name;
  $("sheetNameInput").value = currentSheet.name;
  $("sheetStatus").textContent = "Сохранено";

  setPage("sheets");
  renderGrid();
}

function closeSheetEditor() {
  if (
    sheetDirty &&
    !window.confirm("Есть несохранённые изменения. Закрыть таблицу без сохранения?")
  ) {
    return;
  }

  currentSheet = null;
  sheetDirty = false;

  $("sheetEditorView").classList.add("hidden");
  $("sheetListView").classList.remove("hidden");

  renderSheets();
}

function markSheetDirty() {
  sheetDirty = true;
  $("sheetStatus").textContent = "Есть несохранённые изменения";
}

function renderGrid() {
  if (!currentSheet) return;

  const grid = $("spreadsheetGrid");
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
          <input
            type="text"
            data-cell-row="${r}"
            data-cell-col="${c}"
            value="${value}"
            aria-label="${columnLabel(c)}${r + 1}"
          >
        </td>
      `;
    }

    html += "</tr>";
  }

  html += "</tbody>";
  grid.innerHTML = html;

  $("sheetDimensions").textContent = `${sheetRows} строк · ${sheetCols} столбцов`;
}

async function saveCurrentSheet() {
  if (!currentSheet || !currentUser || !supabaseClient) return;

  const name = $("sheetNameInput").value.trim() || "Без названия";

  currentSheet.name = name;
  currentSheet.sheet_data = currentSheet.sheet_data.slice(0, 300)
    .map((row) => row.slice(0, 40));

  $("saveSheetButton").disabled = true;
  $("sheetStatus").textContent = "Сохраняем...";
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

    $("sheetNameInput").value = currentSheet.name;
    $("sheetPageHeading").textContent = currentSheet.name;
    $("sheetStatus").textContent = "Сохранено";

    const index = sheets.findIndex((item) => item.id === currentSheet.id);

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
    showMessage($("sheetMessage"), "Таблица сохранена в твоём аккаунте.");
  } catch (error) {
    console.error("Ошибка сохранения таблицы:", error);

    $("sheetStatus").textContent = "Ошибка сохранения";

    showMessage(
      $("sheetMessage"),
      `Не удалось сохранить таблицу: ${error.message}`,
      true
    );
  } finally {
    $("saveSheetButton").disabled = false;
  }
}

function addRow() {
  if (!currentSheet) return;

  if (sheetRows >= 300) {
    showMessage($("sheetMessage"), "Достигнут лимит: 300 строк.", true);
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
    showMessage($("sheetMessage"), "Достигнут лимит: 40 столбцов.", true);
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

    if (currentSheet && currentSheet.id === id) {
      currentSheet = null;
      sheetDirty = false;

      $("sheetEditorView").classList.add("hidden");
      $("sheetListView").classList.remove("hidden");
    }

    renderSheets();
    showMessage($("appMessage"), "Таблица удалена.");
  } catch (error) {
    showMessage(
      $("appMessage"),
      `Не удалось удалить таблицу: ${error.message}`,
      true
    );
  }
}

// -------------------- Импорт и экспорт Excel/CSV --------------------

function getExportData() {
  if (!currentSheet) return [];

  return currentSheet.sheet_data.map((row) =>
    row.map((cell) => cell ?? "")
  );
}

function safeFilename(name) {
  return (name || "таблица")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 80) || "таблица";
}

function exportXlsx() {
  if (!currentSheet) return;

  if (!window.XLSX) {
    showMessage(
      $("sheetMessage"),
      "Библиотека Excel не загрузилась. Проверь интернет и обнови страницу.",
      true
    );
    return;
  }

  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet(getExportData());

  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Лист 1");

  window.XLSX.writeFile(
    workbook,
    `${safeFilename(currentSheet.name)}.xlsx`
  );

  showMessage($("sheetMessage"), "Файл XLSX подготовлен для скачивания.");
}

function exportCsv() {
  if (!currentSheet) return;

  const csv = getExportData().map((row) =>
    row.map((value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    }).join(",")
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
      "Библиотека Excel не загрузилась. Проверь интернет и обнови страницу.",
      true
    );
    return;
  }

  try {
    const buffer = await file.arrayBuffer();

    const workbook = window.XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("В файле нет листов.");
    }

    const imported = window.XLSX.utils.sheet_to_json(
      workbook.Sheets[firstSheetName],
      { header: 1, defval: "", raw: false }
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
      "Файл загружен в редактор. Нажми «Сохранить», чтобы записать изменения в архив."
    );
  } catch (error) {
    showMessage(
      $("sheetMessage"),
      `Не удалось прочитать файл: ${error.message}`,
      true
    );
  } finally {
    $("importSheetInput").value = "";
  }
}

// -------------------- Кнопки и события --------------------

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.page;

    if (
      destination === "sheets" &&
      currentSheet
    ) {
      $("sheetEditorView").classList.remove("hidden");
      $("sheetListView").classList.add("hidden");
    }

    if (
      destination !== "sheets" &&
      currentSheet &&
      sheetDirty &&
      !window.confirm("В таблице есть несохранённые изменения. Перейти без сохранения?")
    ) {
      return;
    }

    setPage(destination);
  });
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.go;

    if (
      destination === "sheets" &&
      currentSheet &&
      sheetDirty &&
      !window.confirm("В таблице есть несохранённые изменения. Перейти к списку таблиц?")
    ) {
      return;
    }

    if (destination === "sheets") {
      currentSheet = null;
      sheetDirty = false;
      $("sheetEditorView").classList.add("hidden");
      $("sheetListView").classList.remove("hidden");
    }

    setPage(destination);
  });
});

$("noteForm").addEventListener("submit", saveNote);
$("cancelEdit").addEventListener("click", resetNoteEditor);

$("newNoteButton").addEventListener("click", () => {
  resetNoteEditor();
  $("noteTitle").focus();
});

$("topNewNote").addEventListener("click", () => {
  resetNoteEditor();
  setPage("notes");
  $("noteTitle").focus();
});

$("notesSearch").addEventListener("input", renderNotes);

$("refreshButton").addEventListener("click", async () => {
  await Promise.all([loadNotes(), loadSheets()]);
});

$("homeNewSheet").addEventListener("click", () => {
  if (currentSheet && sheetDirty && !window.confirm("Отменить несохранённые изменения и создать таблицу?")) {
    return;
  }

  currentSheet = null;
  sheetDirty = false;
  setPage("sheets");
  createSheet();
});

$("createSheetButton").addEventListener("click", () => {
  if (currentSheet && sheetDirty && !window.confirm("Отменить несохранённые изменения и создать таблицу?")) {
    return;
  }

  currentSheet = null;
  sheetDirty = false;
  createSheet();
});

$("sheetsSearch").addEventListener("input", renderSheets);
$("backToSheets").addEventListener("click", closeSheetEditor);
$("saveSheetButton").addEventListener("click", saveCurrentSheet);
$("addRowButton").addEventListener("click", addRow);
$("addColButton").addEventListener("click", addColumn);
$("deleteRowButton").addEventListener("click", removeLastRow);
$("deleteColButton").addEventListener("click", removeLastColumn);
$("exportXlsxButton").addEventListener("click", exportXlsx);
$("exportCsvButton").addEventListener("click", exportCsv);

$("importSheetInput").addEventListener("change", (event) => {
  importSpreadsheet(event.target.files[0]);
});

$("sheetNameInput").addEventListener("input", () => {
  if (!currentSheet) return;

  currentSheet.name = $("sheetNameInput").value;
  $("sheetPageHeading").textContent = currentSheet.name || "Без названия";

  markSheetDirty();
});

$("spreadsheetGrid").addEventListener("input", (event) => {
  const input = event.target.closest("[data-cell-row]");

  if (!input || !currentSheet) return;

  const row = Number(input.dataset.cellRow);
  const col = Number(input.dataset.cellCol);

  currentSheet.sheet_data[row][col] = input.value;
  input.classList.add("changed");

  markSheetDirty();
});

document.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-note]");
  const deleteNoteButton = event.target.closest("[data-delete-note]");
  const openSheetButton = event.target.closest("[data-open-sheet]");
  const deleteSheetButton = event.target.closest("[data-delete-sheet]");

  if (editButton) {
    editNote(editButton.dataset.editNote);
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
  }
});

$("noteForm").addEventListener("reset", () => {
  // Никаких дополнительных действий: resetNoteEditor управляет режимом редактора.
});

$("logoutButton").addEventListener("click", async () => {
  // Обработчик выхода находится выше в файле.
});

// -------------------- Запуск приложения --------------------

startApp();
