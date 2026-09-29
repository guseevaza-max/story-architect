"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Неверный email или пароль");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Не удалось выполнить вход");
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
      <h2>Вход</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 16,
          marginTop: 24,
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            style={{
              display: "block",
              width: "100%",
              padding: 8,
            }}
          />
        </label>

        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 8,
            }}
          />
        </label>

        {error && (
          <p style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>

      <p style={{ marginTop: 24 }}>
        Нет аккаунта?{" "}
        <a href="/register">Создать аккаунт</a>
      </p>
    </main>
  );
}