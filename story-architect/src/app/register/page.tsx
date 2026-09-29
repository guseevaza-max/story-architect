"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 500,
        margin: "60px auto",
        padding: 32,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Story Architect</h1>
      <h2>Создание аккаунта</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 16,
          marginTop: 24,
        }}
      >
        <label>
          Имя
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ваше имя"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Минимум 6 символов"
            minLength={6}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        {error && (
          <p style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Создание..." : "Создать аккаунт"}
        </button>
      </form>

      <p style={{ marginTop: 24 }}>
        Уже есть аккаунт?{" "}
        <a href="/login">Войти</a>
      </p>
    </main>
  );
}