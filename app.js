"use strict";

// Элементы интерфейса
const $ = (id) => document.getElementById(id);

const authView = $("authView");
const appView = $("appView");
const authForm = $("authForm");
const authMessage = $("authMessage");
const appMessage = $("appMessage");

let supabaseClient = null;
let currentUser = null;
let notes = [];
let editingId = null;
let authMode = "login";

// Сообщения пользователю
function showMessage(element, text, isError = false) {
  element.textContent = text || "";
  element.classList.toggle("error", Boolean(isError));
}

// Подключение Supabase
function initSupabase() {
  if (supabaseClient) return true;

  if (!window.supabase || !window.supabase.createClient) {
    showMessage(
      authMessage,
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
      authMessage,
      "Не найдены настройки Supabase. Проверь файл config.js.",
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

// Переключение «Войти / Создать аккаунт»
function setAuthMode(mode) {
  authMode = mode;

  $("showLoginTab").classList.toggle("active", mode === "login");
  $("showRegisterTab").classList.toggle("active", mode === "register");

  $("authSubmit").textContent =
    mode === "login" ? "Войти в архив" : "Создать аккаунт";

  $("password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

  showMessage(
    authMessage,
    mode === "login"
      ? "Войди в свой архив."
      : "Введи почту и пароль. После регистрации может понадобиться подтвердить почту."
  );
}

// Показ основного приложения
function showApp(user) {
  currentUser = user;

  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  const email = user.email || "Пользователь";

  $("userPill").textContent = email;
  $("profileEmail").textContent = email;
  $("settingsEmail").textContent = email;

  setPage("home");
  loadNotes();
}

// Возврат к экрану входа
function showAuth() {
  currentUser = null;
  notes = [];

  authView.classList.remove("hidden");
  appView.classList.add("hidden");

  resetEditor();
  renderNotes();
}

// Навигация между разделами
function setPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageName}`);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });
}

// Сброс формы заметки
function resetEditor() {
  editingId = null;

  if ($("noteForm")) {
    $("noteForm").reset();
  }

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

// Безопасное отображение текста в HTML
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return replacements[character];
  });
}

// Форматирование даты
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

// Склонение слова «заметка»
function pluralNotes(number) {
  const lastTwo = number % 100;
  const last = number % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "заметок";
  if (last === 1) return "заметка";
  if (last >= 2 && last <= 4) return "заметки";

  return "заметок";
}

// Создание карточки заметки
function noteCard(note) {
  const title = escapeHTML(note.title || "Без названия");
  const content = escapeHTML(note.encrypted_content || "");
  const id = escapeHTML(note.id);
  const date = escapeHTML(formatDate(note.updated_at || note.created_at));

  return `
    <article class="note-card">
      <h4>${title}</h4>
      <p class="note-content">${content}</p>
      <div class="note-meta">Изменено: ${date}</div>
      <div class="note-actions">
        <button class="btn secondary small" type="button" data-edit="${id}">
          Изменить
        </button>
        <button class="btn danger small" type="button" data-delete="${id}">
          Удалить
        </button>
      </div>
    </article>
  `;
}

// Отображение списка заметок
function renderList(container, items, emptyText) {
  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span>📭</span>
        ${escapeHTML(emptyText)}
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(noteCard).join("");
}

// Обновление всех списков и статистики
function renderNotes() {
  const searchElement = $("notesSearch");
  const query = searchElement
    ? searchElement.value.trim().toLocaleLowerCase("ru")
    : "";

  const filteredNotes = notes.filter((note) => {
    const text = `${note.title || ""} ${note.encrypted_content || ""}`;
    return text.toLocaleLowerCase("ru").includes(query);
  });

  renderList(
    $("notesList"),
    filteredNotes,
    query
      ? "Ничего не найдено. Попробуй другой запрос."
      : "Здесь пока пусто. Создай свою первую заметку!"
  );

  // На главной показываем четыре последние записи
  renderList(
    $("recentNotes"),
    notes.slice(0, 4),
    "Здесь появятся твои первые заметки. Нажми «Новая заметка», чтобы начать."
  );

  renderList(
    $("historyList"),
    notes,
    "История пока пуста. Сохрани заметку — и она появится здесь."
  );

  $("homeNoteCount").textContent = notes.length;
  $("notesTotal").textContent = `${notes.length} ${pluralNotes(notes.length)}`;
  $("profileNoteCount").textContent = notes.length;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const recentCount = notes.filter((note) => {
    const date = new Date(note.updated_at || note.created_at).getTime();
    return Number.isFinite(date) && date >= weekAgo;
  }).length;

  $("homeRecentCount").textContent = recentCount;
}

// Загрузка заметок текущего пользователя
async function loadNotes() {
  if (!supabaseClient || !currentUser) return;

  showMessage(appMessage, "Загружаем заметки...");

  try {
    const { data, error } = await supabaseClient
      .from("notes")
      .select("id,user_id,title,encrypted_content,created_at,updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    notes = data || [];
    renderNotes();

    showMessage(
      appMessage,
      notes.length
        ? `Загружено заметок: ${notes.length}.`
        : "Архив готов. Создай свою первую заметку!"
    );
  } catch (error) {
    console.error("Ошибка загрузки заметок:", error);

    showMessage(
      appMessage,
      `Не удалось загрузить заметки: ${error.message}. Проверь таблицу notes и политики RLS в Supabase.`,
      true
    );
  }
}

// Создание или изменение заметки
async function saveNote(event) {
  event.preventDefault();

  if (!supabaseClient || !currentUser) {
    showMessage(appMessage, "Сначала войди в аккаунт.", true);
    return;
  }

  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    showMessage(appMessage, "Заполни название и текст заметки.", true);
    return;
  }

  const wasEditing = Boolean(editingId);

  const payload = {
    title,
    encrypted_content: content,
    updated_at: new Date().toISOString()
  };

  $("saveButton").disabled = true;

  showMessage(
    appMessage,
    wasEditing ? "Обновляем заметку..." : "Сохраняем заметку..."
  );

  try {
    let result;

    if (editingId) {
      // Изменяем только собственную заметку
      result = await supabaseClient
        .from("notes")
        .update(payload)
        .eq("id", editingId)
        .eq("user_id", currentUser.id)
        .select()
        .single();
    } else {
      // Добавляем новую заметку владельцу аккаунта
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

    resetEditor();
    await loadNotes();
    setPage("notes");

    showMessage(
      appMessage,
      wasEditing ? "Заметка обновлена." : "Заметка сохранена."
    );
  } catch (error) {
    console.error("Ошибка сохранения заметки:", error);

    showMessage(
      appMessage,
      `Не удалось сохранить заметку: ${error.message}`,
      true
    );
  } finally {
    $("saveButton").disabled = false;
  }
}

// Открытие заметки для редактирования
function startEditing(id) {
  const selectedNote = notes.find((item) => item.id === id);

  if (!selectedNote) return;

  editingId = selectedNote.id;
  $("noteTitle").value = selectedNote.title || "";
  $("noteContent").value = selectedNote.encrypted_content || "";

  $("editorHeading").textContent = "Редактирование заметки";
  $("saveButton").textContent = "Сохранить изменения";
  $("cancelEdit").classList.remove("hidden");

  setPage("notes");
  $("noteTitle").focus();

  showMessage(appMessage, "Внеси изменения и нажми «Сохранить изменения».");
}

// Удаление заметки
async function deleteNote(id) {
  if (!supabaseClient || !currentUser) return;

  const selectedNote = notes.find((item) => item.id === id);

  if (!selectedNote) return;

  const confirmed = window.confirm(
    `Удалить заметку «${selectedNote.title || "Без названия"}»? Это действие нельзя отменить.`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    if (editingId === id) {
      resetEditor();
    }

    await loadNotes();
    showMessage(appMessage, "Заметка удалена.");
  } catch (error) {
    console.error("Ошибка удаления заметки:", error);

    showMessage(
      appMessage,
      `Не удалось удалить заметку: ${error.message}`,
      true
    );
  }
}

// Вход или регистрация
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!initSupabase()) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || password.length < 6) {
    showMessage(
      authMessage,
      "Укажи почту и пароль минимум из 6 символов.",
      true
    );
    return;
  }

  const submitButton = $("authSubmit");
  submitButton.disabled = true;

  showMessage(
    authMessage,
    authMode === "login" ? "Выполняем вход..." : "Создаём аккаунт..."
  );

  try {
    if (authMode === "login") {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        showApp(data.user);
      } else {
        showMessage(authMessage, "Не удалось получить данные аккаунта.", true);
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
        // При включённом подтверждении почты сессия может не создаться сразу
        setAuthMode("login");
        showMessage(
          authMessage,
          "Аккаунт создан. Проверь почту, подтверди регистрацию, затем войди."
        );
      }
    }
  } catch (error) {
    console.error("Ошибка авторизации:", error);

    showMessage(
      authMessage,
      `Не удалось выполнить действие: ${error.message}`,
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

// Кнопки переключения режима авторизации
$("showLoginTab").addEventListener("click", () => setAuthMode("login"));
$("showRegisterTab").addEventListener("click", () => setAuthMode("register"));

// Навигация по разделам
document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});

// Переходы на раздел заметок
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.go));
});

$("homeNewNote").addEventListener("click", () => {
  resetEditor();
  setPage("notes");
  $("noteTitle").focus();
});

$("newNoteButton").addEventListener("click", () => {
  resetEditor();
  $("noteTitle").focus();
});

$("cancelEdit").addEventListener("click", resetEditor);

// Форма, поиск и обновление
$("noteForm").addEventListener("submit", saveNote);
$("notesSearch").addEventListener("input", renderNotes);
$("refreshButton").addEventListener("click", loadNotes);

// Кнопки редактирования и удаления в карточках
document.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (editButton) {
    startEditing(editButton.dataset.edit);
  }

  if (deleteButton) {
    deleteNote(deleteButton.dataset.delete);
  }
});

// Выход из аккаунта
$("logoutButton").addEventListener("click", async () => {
  if (!initSupabase()) return;

  const logoutButton = $("logoutButton");
  logoutButton.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    showAuth();
    showMessage(authMessage, "Ты вышел из аккаунта.");
  } catch (error) {
    console.error("Ошибка выхода:", error);

    showMessage(
      appMessage,
      `Не удалось выйти из аккаунта: ${error.message}`,
      true
    );
  } finally {
    logoutButton.disabled = false;
  }
});

// Запуск: восстановить существующую сессию после обновления страницы
async function startApp() {
  if (!initSupabase()) return;

  showMessage(authMessage, "Проверяем вход...");

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
      authMessage,
      `Не удалось проверить сессию: ${error.message}`,
      true
    );
  }
}

startApp();
