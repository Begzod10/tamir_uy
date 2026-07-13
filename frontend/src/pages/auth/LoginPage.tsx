import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { requestOTP, verifyOTP, loginWithPassword, registerUser } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { uz } from "@/locale/uz";

type AuthMode = "login" | "register" | "otp-phone" | "otp-code";

const RESEND_COOLDOWN = 60;

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) return `+${digits}`;
  if (digits.startsWith("0")) return `+998${digits.slice(1)}`;
  return `+998${digits}`;
}

function isValidPhone(phone: string): boolean {
  return /^\+998\d{9}$/.test(phone);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  const from: string = (location.state as { from?: string })?.from ?? "/projects";

  const [mode, setMode] = useState<AuthMode>("login");

  // Username/password fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // OTP fields
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function resetError() { setError(null); }

  function switchMode(m: AuthMode) {
    setMode(m);
    resetError();
  }

  // ── Username/password login ──────────────────────────────────
  async function handleLogin() {
    resetError();
    if (!username.trim() || !password) { setError("Username va parol majburiy."); return; }
    setLoading(true);
    try {
      const res = await loginWithPassword({ username: username.trim(), password });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError("Username yoki parol noto'g'ri.");
    } finally {
      setLoading(false);
    }
  }

  // ── Register ──────────────────────────────────────────────────
  async function handleRegister() {
    resetError();
    if (!username.trim()) { setError("Username majburiy."); return; }
    if (username.trim().length < 3) { setError("Username kamida 3 ta belgidan iborat bo'lishi kerak."); return; }
    if (!password) { setError("Parol majburiy."); return; }
    if (password.length < 6) { setError("Parol kamida 6 ta belgidan iborat bo'lishi kerak."); return; }
    if (password !== confirmPassword) { setError("Parollar mos kelmadi."); return; }
    setLoading(true);
    try {
      const res = await registerUser({ username: username.trim(), password, name: name.trim() || undefined });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("band")) {
        setError("Bu username allaqachon band. Boshqa username tanlang.");
      } else {
        setError("Ro'yxatdan o'tishda xato yuz berdi.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── OTP ──────────────────────────────────────────────────────
  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleRequestOTP() {
    resetError();
    const normalized = formatPhone(phone);
    if (!isValidPhone(normalized)) { setError(uz.errors.telefon_format); return; }
    setLoading(true);
    try {
      await requestOTP(normalized);
      setPhone(normalized);
      setMode("otp-code");
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError(uz.errors.server_xato);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTPWithCode(code: string) {
    resetError();
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError(uz.errors.otp_xato);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    const code = otp.join("");
    if (code.length < 6) { setError(uz.errors.otp_xato); return; }
    await handleVerifyOTPWithCode(code);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    resetError();
    setLoading(true);
    try {
      await requestOTP(phone);
      setOtp(["", "", "", "", "", ""]);
      startCooldown();
      otpRefs.current[0]?.focus();
    } catch {
      setError(uz.errors.server_xato);
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && digit) {
      const code = next.join("");
      if (code.length === 6) setTimeout(() => handleVerifyOTPWithCode(code), 50);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand flex items-center justify-center text-3xl mx-auto mb-3">
          🏠
        </div>
        <h1 className="text-2xl font-bold text-gray-900">UyTa'mir</h1>
        <p className="text-sm text-muted mt-1">Interior dizayn platformasi</p>
      </div>

      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-md p-6">
        {/* ── OTP code step ── */}
        {mode === "otp-code" ? (
          <>
            <button
              onClick={() => { setMode("otp-phone"); resetError(); }}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-900 transition-colors mb-4"
            >
              ← {uz.auth.orqaga}
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{uz.auth.otp_kod}</h2>
            <p className="text-sm text-muted mb-5">
              <span className="font-medium text-gray-900">{phone}</span> raqamiga yuborildi
            </p>
            <div className="flex gap-2 justify-center mb-5">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-bold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                />
              ))}
            </div>
            {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}
            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.some((d) => !d)}
              className="w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? uz.common.yuklanmoqda : uz.auth.otp_tasdiqlash}
            </button>
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="mt-3 w-full text-sm text-muted hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cooldown > 0 ? `${uz.auth.qayta_yuborish} (${cooldown}s)` : uz.auth.qayta_yuborish}
            </button>
          </>
        ) : (
          <>
            {/* ── Tabs ── */}
            <div className="flex rounded-xl bg-gray-100 p-1 mb-5 gap-1">
              <button
                onClick={() => switchMode("login")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-muted hover:text-gray-700"
                }`}
              >
                Kirish
              </button>
              <button
                onClick={() => switchMode("register")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-muted hover:text-gray-700"
                }`}
              >
                Ro'yxatdan o'tish
              </button>
            </div>

            {/* ── Login tab ── */}
            {mode === "login" && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="username"
                      autoComplete="username"
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Parol</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="mt-4 w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? uz.common.yuklanmoqda : "Kirish"}
                </button>

                {/* OTP divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-muted">yoki</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <button
                  onClick={() => switchMode("otp-phone")}
                  className="w-full border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  📱 SMS kod bilan kirish
                </button>
              </>
            )}

            {/* ── Register tab ── */}
            {mode === "register" && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ism (ixtiyoriy)</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ismingiz"
                      autoComplete="name"
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      autoComplete="username"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Parol</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Parolni tasdiqlang</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="mt-4 w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? uz.common.yuklanmoqda : "Ro'yxatdan o'tish"}
                </button>
              </>
            )}

            {/* ── OTP phone step ── */}
            {mode === "otp-phone" && (
              <>
                <button
                  onClick={() => switchMode("login")}
                  className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-900 transition-colors mb-4"
                >
                  ← {uz.auth.orqaga}
                </button>
                <h2 className="text-base font-semibold text-gray-900 mb-1">SMS kod bilan kirish</h2>
                <p className="text-sm text-muted mb-4">Telefon raqamingizga SMS kod yuboramiz</p>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{uz.auth.telefon}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRequestOTP()}
                  placeholder={uz.auth.telefon_placeholder}
                  autoFocus
                  autoComplete="tel"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                />
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                <button
                  onClick={handleRequestOTP}
                  disabled={loading}
                  className="mt-4 w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? uz.common.yuklanmoqda : uz.auth.otp_yuborish}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted mt-6 text-center opacity-60">UyTa'mir v1.0.0</p>
    </div>
  );
}
