"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  async function handleLogout() {
    await signOut({
      redirect: false,
    });

    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{
        marginTop: 12,
        padding: "8px 14px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        cursor: "pointer",
      }}
    >
      Выйти
    </button>
  );
}