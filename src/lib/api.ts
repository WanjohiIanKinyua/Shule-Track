const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export function getToken() {
  return sessionStorage.getItem("shule_token");
}

export function setToken(token: string) {
  sessionStorage.setItem("shule_token", token);
}

export function clearToken() {
  sessionStorage.removeItem("shule_token");
}

export async function api(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}
