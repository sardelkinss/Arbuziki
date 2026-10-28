"use strict";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const auth = document.getElementById("auth");
const cabinet = document.getElementById("cabinet");
const userEmail = document.getElementById("userEmail");
const logoutButton = document.getElementById("logoutButton");
const saveButton = document.getElementById("saveButton");
const note = document.getElementById("note");

let supabaseClient = null;

function showMessage(text) {
  message.textContent = text;
}

function showCabinet(user) {
  auth.classList.add("hidden");
  cabinet.classList.remove("hidden");
  userEmail.textContent = "Ты вошёл как: " + user.email;
  showMessage("Добро пожаловать в архив!");
}

function showAuth() {
  cabinet.classList.add("hidden");
  auth.classList.remove("hidden");
  showMessage("Войди или создай аккаунт.");
}

function initializeSupabase() {
  if (supabaseClient) return true;

  if (!window.supabase || !window.supabase.createClient) {
    showMessage("Не загрузилась библиотека Supabase.");
    return false;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_KEY === "undefined" ||
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    showMessage("Проверь файл config.js.");
    return false;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return true;
}

function getCredentials() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Введи почту и пароль.");
    return null;
  }

  if (password.length < 6) {
    showMessage("Пароль должен содержать минимум 6 символов.");
    return null;
  }

  return { email, password };
}

registerButton.addEventListener("click", async () => {
  if (!initializeSupabase()) return;

  const credentials = getCredentials();
  if (!credentials) return;

  registerButton.disabled = true;
  loginButton.disabled = true;
  showMessage("Создаём аккаунт...");

  try {
    const { data, error } =
      await supabaseClient.auth.signUp(credentials);

    if (error) {
      showMessage("Ошибка регистрации: " + error.message);
    } else if (data.session && data.user) {
      showCabinet(data.user);
    } else {
      showMessage("Проверь почту для подтверждения регистрации.");
    }
  } catch (error) {
    console.error("Ошибка регистрации:", error);
    showMessage("Не удалось связаться с Supabase.");
  } finally {
    registerButton.disabled = false;
    loginButton.disabled = false;
  }
});

loginButton.addEventListener("click", async () => {
  if (!initializeSupabase()) return;

  const credentials = getCredentials();
  if (!credentials) return;

  loginButton.disabled = true;
  registerButton.disabled = true;
  showMessage("Выполняем вход...");

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword(credentials);

    if (error) {
      showMessage("Ошибка входа: " + error.message);
    } else if (data.user) {
      showCabinet(data.user);
    } else {
      showMessage("Не удалось получить данные аккаунта.");
    }
  } catch (error) {
    console.error("Ошибка входа:", error);
    showMessage("Не удалось связаться с Supabase.");
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  if (!initializeSupabase()) return;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showMessage("Ошибка выхода: " + error.message);
      return;
    }

    note.value = "";
    showAuth();
  } catch (error) {
    console.error("Ошибка выхода:", error);
    showMessage("Не удалось выполнить выход.");
  }
});

saveButton.addEventListener("click", () => {
  showMessage("Сохранение заметок подключим следующим шагом.");
});

async function startApp() {
  if (!initializeSupabase()) return;

  showMessage("Проверяем вход...");

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Ошибка сессии:", error);
      showAuth();
      showMessage("Не удалось проверить вход: " + error.message);
      return;
    }

    if (data.session) {
      showCabinet(data.session.user);
    } else {
      showAuth();
    }
  } catch (error) {
    console.error("Ошибка запуска:", error);
    showAuth();
    showMessage("Ошибка запуска: " + error.message);
  }
}

startApp();
// Переключение разделов Арбузного архива
const archivePages = {
  home: document.getElementById("archiveHome"),
  notes: document.getElementById("archiveNotes"),
  history: document.getElementById("archiveHistory"),
  profile: document.getElementById("archiveProfile"),
  settings: document.getElementById("archiveSettings")
};

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const pageName = button.dataset.page;

    Object.entries(archivePages).forEach(([name, page]) => {
      if (page) page.classList.toggle("hidden", name !== pageName);
    });

    document.querySelectorAll(".nav-btn").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

// Показываем почту в профиле
const profileEmail = document.getElementById("profileEmail");

if (profileEmail) {
  const currentEmail = document.getElementById("userEmail");

  if (currentEmail) {
    profileEmail.textContent = currentEmail.textContent;
  }
}

// Кнопка создания заметки открывает раздел заметок
const newNoteButton = document.getElementById("newNoteButton");

if (newNoteButton) {
  newNoteButton.addEventListener("click", () => {
    const notesButton = document.querySelector('[data-page="notes"]');
    if (notesButton) notesButton.click();

    const titleInput = document.getElementById("noteTitle");
    if (titleInput) titleInput.focus();
  });
}
