const SUCCESS_EVENT = "shule:success";

export function showSuccess(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUCCESS_EVENT, { detail: message }));
}

export function successEventName() {
  return SUCCESS_EVENT;
}
