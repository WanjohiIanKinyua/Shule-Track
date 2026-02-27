import { useState } from "react";
import { useAuth } from "../state/AuthContext";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        await register(name, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Auth failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-clean">
        <div className="auth-brand">
          <span className="auth-brand-icon" aria-hidden="true"></span>
          <h1>
            <span>Shule</span>
            <span className="auth-brand-accent">Track</span>
          </h1>
        </div>

        <h2 className="auth-title">{mode === "login" ? "Welcome back" : "Create account"}</h2>
        <p className="auth-subtitle">
          {mode === "login" ? "Sign in to manage your classes" : "Register to start managing your classes"}
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "register" && (
            <label>
              Full Name
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Teacher Ian" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="teacher@school.ac.ke"
            />
          </label>
          <label>
            Password
            <div className="password-input-wrap">
              <input
                type={mode === "login" ? (showLoginPassword ? "text" : "password") : showRegisterPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                placeholder="********"
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={mode === "login" ? (showLoginPassword ? "Hide password" : "Show password") : showRegisterPassword ? "Hide password" : "Show password"}
                onClick={() =>
                  mode === "login" ? setShowLoginPassword((v) => !v) : setShowRegisterPassword((v) => !v)
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
          </label>
          {mode === "register" && (
            <label>
              Confirm Password
              <div className="password-input-wrap">
                <input
                  type={showRegisterConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                  placeholder="********"
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showRegisterConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowRegisterConfirmPassword((v) => !v)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </button>
              </div>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="btn btn-ghost auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setPassword("");
            setConfirmPassword("");
          }}
        >
          {mode === "login" ? "Don't have an account? Register" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
