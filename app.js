const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

document.getElementById("registerButton").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    message.textContent = "Введи почту и пароль.";
    return;
  }

  if (password.length < 6) {
    message.textContent = "Пароль должен содержать минимум 6 символов.";
    return;
  }

  message.textContent = "Создаём аккаунт...";

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password
  });

  if (error) {
    message.textContent = "Ошибка: " + error.message;
    return;
  }

  if (data.session) {
    message.textContent = "Аккаунт создан! Ты вошёл в систему 🍉";
  } else {
    message.textContent =
      "Аккаунт создан! Проверь почту для подтверждения регистрации.";
  }
});

document.getElementById("loginButton").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    message.textContent = "Введи почту и пароль.";
    return;
  }

  message.textContent = "Выполняем вход...";

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    message.textContent = "Ошибка входа: " + error.message;
    return;
  }

  message.textContent = "Вход выполнен успешно! 🍉";
});
