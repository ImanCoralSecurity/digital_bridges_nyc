"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/public";
  }
  return (
    <button className="secondary small" onClick={logout} title="Lock this workspace">
      Lock
    </button>
  );
}
