import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";

type Teacher = { id: string; name: string; email: string } | null;

type AuthContextValue = {
  teacher: Teacher;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshTeacher: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api("/me")
      .then((user) => setTeacher(user))
      .catch(() => {
        clearToken();
        setTeacher(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && getToken()) {
        clearToken();
        setTeacher(null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function login(email: string, password: string) {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setTeacher(data.teacher);
  }

  async function register(name: string, email: string, password: string) {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setToken(data.token);
    setTeacher(data.teacher);
  }

  function logout() {
    clearToken();
    setTeacher(null);
  }

  async function refreshTeacher() {
    const user = await api("/me");
    setTeacher(user);
  }

  const value = useMemo(
    () => ({ teacher, loading, login, register, logout, refreshTeacher }),
    [teacher, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
