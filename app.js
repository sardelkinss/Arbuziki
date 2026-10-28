"use strict";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");

let supabaseClient = null;

function showMessage(text) {
  message.textContent = text;
}

function initializeSupabase() {
  if (supabaseClient) return true;

  if (!window.supabase || !window.supabase.createClient) {
    showMessage("Не загрузилась библиотека Supabase. Обнови страницу.");
    return false;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_KEY === "undefined" ||
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    showMessage("Проверь настройки в файле config.js.");
    return false;
  }

  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );
    return true;
  } catch (error) {
    console.error("Ошибка подключения:", error);
    showMessage("Не удалось подключить Supabase.");
    return false;
  }
}

function getCredentials() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Введи электронную почту и пароль.");
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
    const { data, error } = await supabaseClient.auth.signUp({
      email: credentials.email,
      password: credentials.password
    });

    if (error) {
      showMessage("Ошибка регистрации: " + error.message);
      return;
    }

    if (data.session) {
      showMessage("Аккаунт создан! Ты вошёл в систему.");
    } else {
      showMessage("Аккаунт создан! Проверь почту для подтверждения.");
    }
  } catch (error) {
    console.error("Ошибка регистрации:", error);
    showMessage("Не удалось связаться с Supabase. Проверь интернет.");
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
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    });

    if (error) {
      showMessage("Ошибка входа: " + error.message);
      return;
    }

    if (data.user) {
      showMessage("Вход выполнен успешно!");
    }
  } catch (error) {
    console.error("Ошибка входа:", error);
    showMessage("Не удалось связаться с Supabase. Проверь интернет.");
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});

if (initializeSupabase()) {
  showMessage("Арбузный архив готов. Войди или создай аккаунт.");
}
