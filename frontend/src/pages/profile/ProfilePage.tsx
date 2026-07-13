import { useState } from "react";
import { uz } from "@/locale/uz";
import { clearToken, getToken } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const MENU_ITEMS = [
  { icon: "🏠", label: "Mening loyihalarim", to: "/projects" },
  { icon: "🧮", label: "Yangi hisob-kitob", to: "/wizard" },
  { icon: "👷", label: "Ustalar", to: "/ustalar" },
];

const STATS = [
  { label: "Loyihalar", value: "—" },
  { label: "Xonalar", value: "—" },
  { label: "Smetalar", value: "—" },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const isLoggedIn = !!getToken();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
  }

  return (
    <div className="min-h-screen bg-paper pb-20">
      {/* Header */}
      <div className="bg-brand px-5 pt-10 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white text-xl font-bold">{uz.nav.profil}</h1>
          {loggedIn && (
            <button
              onClick={handleLogout}
              className="text-white/70 text-sm hover:text-white transition-colors"
            >
              {uz.auth.chiqish}
            </button>
          )}
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">
            👤
          </div>
          <div>
            <p className="text-white font-semibold text-base">
              {loggedIn ? "Foydalanuvchi" : "Mehmon"}
            </p>
            <p className="text-white/60 text-sm mt-0.5">
              {loggedIn ? "UyTa'mir foydalanuvchisi" : "Kirish qilinmagan"}
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mx-4 -mt-8 bg-surface rounded-card shadow-md grid grid-cols-3 divide-x divide-gray-100">
        {STATS.map((s) => (
          <div key={s.label} className="py-4 text-center">
            <p className="text-lg font-bold text-brand">{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Menu */}
      <div className="mx-4 mt-5 bg-surface rounded-card shadow-sm overflow-hidden">
        {MENU_ITEMS.map((item, i) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={[
              "w-full flex items-center gap-4 px-5 py-4",
              "hover:bg-paper transition-colors text-left",
              i < MENU_ITEMS.length - 1 ? "border-b border-gray-100" : "",
            ].join(" ")}
          >
            <span className="text-xl w-7 text-center">{item.icon}</span>
            <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
            <span className="text-muted text-sm">→</span>
          </button>
        ))}
      </div>

      {/* Login CTA if not logged in */}
      {!loggedIn && (
        <div className="mx-4 mt-4 bg-brand/5 border border-brand/20 rounded-card p-4">
          <p className="text-sm text-muted mb-3">
            Loyihalaringizni saqlash uchun telefon raqamingizni kiriting.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-brand text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            Kirish
          </button>
        </div>
      )}

      {/* App version */}
      <p className="text-center text-xs text-muted mt-8 opacity-50">
        UyTa'mir v1.0.0
      </p>
    </div>
  );
}
