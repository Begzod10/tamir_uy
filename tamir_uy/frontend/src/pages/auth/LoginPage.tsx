import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { requestOTP, verifyOTP, setToken } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { uz } from "@/locale/uz";

type Step = "phone" | "otp";

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
  const setStoreToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  const from: string = (location.state as { from?: string })?.from ?? "/projects";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function handleRequestOTP() {
    setError(null);
    const normalized = formatPhone(phone);
    if (!isValidPhone(normalized)) {
      setError(uz.errors.telefon_format);
      return;
    }
    setLoading(true);
    try {
      await requestOTP(normalized);
      setPhone(normalized);
      setStep("otp");
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError(uz.errors.server_xato);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    setError(null);
    const code = otp.join("");
    if (code.length < 6) {
      setError(uz.errors.otp_xato);
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      setToken(res.access_token);
      setStoreToken(res.access_token);
      setUser({ id: "", phone, name: "Foydalanuvchi" });
      navigate(from, { replace: true });
    } catch {
      setError(uz.errors.otp_xato);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
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
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d !== "") && digit) {
      const code = next.join("");
      if (code.length === 6) {
        setTimeout(() => handleVerifyOTPWithCode(code), 50);
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyOTPWithCode(code: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      setToken(res.access_token);
      setStoreToken(res.access_token);
      setUser({ id: "", phone, name: "Foydalanuvchi" });
      navigate(from, { replace: true });
    } catch {
      setError(uz.errors.otp_xato);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handlePhoneKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleRequestOTP();
  }

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
        {step === "phone" ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {uz.auth.kirish}
            </h2>
            <p className="text-sm text-muted mb-5">
              Telefon raqamingizga SMS kod yuboramiz
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {uz.auth.telefon}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={handlePhoneKeyDown}
              placeholder={uz.auth.telefon_placeholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
              autoFocus
              autoComplete="tel"
            />

            {error && (
              <p className="text-xs text-red-500 mt-2">{error}</p>
            )}

            <button
              onClick={handleRequestOTP}
              disabled={loading}
              className="mt-4 w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? uz.common.yuklanmoqda : uz.auth.otp_yuborish}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStep("phone"); setError(null); }}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-900 transition-colors mb-4"
            >
              ← {uz.auth.orqaga}
            </button>

            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {uz.auth.otp_kod}
            </h2>
            <p className="text-sm text-muted mb-5">
              <span className="font-medium text-gray-900">{phone}</span> raqamiga yuborildi
            </p>

            {/* OTP boxes */}
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

            {error && (
              <p className="text-xs text-red-500 text-center mb-3">{error}</p>
            )}

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
              {cooldown > 0
                ? `${uz.auth.qayta_yuborish} (${cooldown}s)`
                : uz.auth.qayta_yuborish}
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-muted mt-6 text-center opacity-60">
        UyTa'mir v1.0.0
      </p>
    </div>
  );
}
