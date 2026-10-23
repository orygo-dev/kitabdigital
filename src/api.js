let csrf = "";
export async function api(path, options = {}) {
  const headers = {
    ...(!(options.body instanceof FormData) && options.body
      ? { "Content-Type": "application/json" }
      : {}),
    ...options.headers,
  };
  if (csrf && options.method && options.method !== "GET")
    headers["X-CSRF-Token"] = csrf;
  let res;
  try {
    res = await fetch("/api" + path, { ...options, headers });
  } catch {
    throw Error("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
  }
  const data = await res
    .json()
    .catch(() => ({
      detail: res.status === 413
        ? "Unggahan ditolak karena ukurannya melebihi batas server atau proxy. Cloudflare Free/Pro membatasi satu unggahan hingga 100 MB."
        : "Respons server tidak valid.",
    }));
  if (!res.ok) {
    const error = Error(
      typeof data.detail === "string"
        ? data.detail
        : "Data tidak valid. Periksa isian Anda.",
    );
    error.status = res.status;
    throw error;
  }
  if (path === "/auth/logout") csrf = "";
  if (data.csrf) csrf = data.csrf;
  return data;
}
export const fileUrl = (ref) => (ref ? "/api/files/" + ref : "");
export function readLocal(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value === null) return fallback;
    if (
      fallback &&
      typeof fallback === "object" &&
      (typeof value !== "object" ||
        Array.isArray(value) !== Array.isArray(fallback))
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export async function downloadBook(book) {
  if (!("caches" in window))
    throw Error("Penyimpanan offline tidak tersedia pada peramban ini.");
  let response;
  try {
    response = await fetch(fileUrl(book.file) + "?download=true");
  } catch {
    throw Error("Unduhan gagal. Periksa koneksi Anda.");
  }
  if (!response.ok) throw Error("Unduhan kitab gagal.");
  try {
    const cache = await caches.open("kitab-downloads-v1");
    await cache.put(fileUrl(book.file), response);
  } catch {
    throw Error(
      "Kitab gagal disimpan. Ruang penyimpanan mungkin penuh atau dibatasi peramban.",
    );
  }
  saveLocal("offline-books", {
    ...readLocal("offline-books", {}),
    [book.id]: book,
  });
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* The book has already been saved. */
  }
}
export async function isBookDownloaded(book) {
  if (!("caches" in window)) return false;
  try {
    return !!(await (
      await caches.open("kitab-downloads-v1")
    ).match(fileUrl(book.file)));
  } catch {
    return false;
  }
}
