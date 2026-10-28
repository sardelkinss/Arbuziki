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
    typeof SUPABASE_KEY === "undefined"
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
    const { data, error } = await supabaseClient.auth.signUp(credentials);

    if (error) {
      showMessage("Ошибка регистрации: " + error.message);
    } else if (data.session && data.user) {
      showCabinet(data.user);
    } else {
      showMessage("Проверь почту для подтверждения регистрации.");
    }
  } catch (error) {
    console.error(error);
    showMessage("Не удалось связаться с сервером.");
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
  const { data, error } =
  await supabaseClient.auth.signInWithPassword(credentials)
    if (error) {
      showMessage("Ошибка входа: " + error.message);
  } else if (data.user) {
  showCabinet(data.user);
}
    }
  } catch (error) {
    console.error(error);
    showMessage("Не удалось связаться с сервером.");
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showMessage("Ошибка выхода: " + error.message);
    return;
  }

  note.value = "";
  showAuth();
});

saveButton.addEventListener("click", () => {
  showMessage("Сохранение заметок подключим следующим шагом.");
});

async function startApp() {
  if (!initializeSupabase()) return;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showMessage("Не удалось проверить вход.");
    return;
  }

  if (data.session) {
    showCabinet(data.session.user);
  } else {
    showAuth();
  }
}

startApp();
