// Session secrets stay in memory; the session cookie is HttpOnly.
let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export function getCsrfToken() {
  return csrfToken;
}
