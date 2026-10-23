import React, { useEffect, useState, useRef } from "react";
import { api, fileUrl } from "./api";
const titles = {
  dashboard: "Ringkasan",
  books: "Kitab",
  audio: "Audio",
  "book-categories": "Kategori kitab",
  "audio-categories": "Kategori audio",
  playlists: "Daftar putar",
  settings: "Tampilan & beranda",
};
const blank = {
  title: "",
  author: "",
  description: "",
  file: "",
  cover: "",
  category_id: null,
  direction: "rtl",
  position: 0,
  published: false,
  downloadable: true,
  featured: false,
};
export default function Admin({ onChange, settings }) {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [tab, setTab] = useState("dashboard"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [rows, setRows] = useState([]),
    [form, setForm] = useState(null),
    [categories, setCategories] = useState([]),
    [audios, setAudios] = useState([]),
    [busy, setBusy] = useState(false),
    [fetching, setFetching] = useState(false);
  const requestVersion = useRef(0);
  function fail(error) {
    setError(error.message);
    if (error.status === 401) setUser(null);
  }
  useEffect(() => {
    api("/auth/session")
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  async function load() {
    const version = ++requestVersion.current;
    setFetching(true);
    setError("");
    setMessage("");
    setForm(null);
    try {
      if (tab === "settings") {
        const current = await api("/settings");
        if (version === requestVersion.current) setForm(current);
        return;
      }
      const [items, cats, tracks] = await Promise.all([
        api("/admin/" + tab),
        tab === "books" || tab === "audio"
          ? api(
              "/admin/" +
                (tab === "books" ? "book-categories" : "audio-categories"),
            )
          : [],
        tab === "playlists" ? api("/admin/audio") : [],
      ]);
      if (version !== requestVersion.current) return;
      setRows(items);
      setCategories(cats);
      setAudios(tracks);
    } catch (e) {
      if (version === requestVersion.current) fail(e);
    } finally {
      if (version === requestVersion.current) setFetching(false);
    }
  }
  useEffect(() => {
    if (user) load();
    return () => {
      requestVersion.current++;
    };
  }, [tab, user]);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(e.target));
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setUser(await api("/auth/session"));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e, key, kind) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api("/admin/uploads/" + kind, {
        method: "POST",
        body,
      });
      setForm((f) => ({ ...f, [key]: result.file }));
      setMessage("Berkas berhasil diunggah. Simpan formulir untuk menerapkan.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...form };
      delete body.id;
      delete body.created_at;
      const path =
        tab === "settings"
          ? "/admin/settings"
          : "/admin/" + tab + (form.id ? "/" + form.id : "");
      await api(path, {
        method: tab === "settings" || form.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      await load();
      await onChange();
      setMessage("Perubahan berhasil disimpan.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row) {
    if (!confirm(`Hapus “${row.title || row.name}”?`)) return;
    setBusy(true);
    try {
      await api("/admin/" + tab + "/" + row.id, { method: "DELETE" });
      await load();
      await onChange();
      setMessage("Konten berhasil dihapus.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (key, label, type = "text", extra = {}) => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={form?.[key] ?? ""}
        onChange={(e) =>
          setForm({
            ...form,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
        {...extra}
      />
    </label>
  );
  const check = (key, label) => (
    <label className="check" key={key}>
      <input
        type="checkbox"
        checked={!!form?.[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  const image = (key, label) => (
    <label key={key}>
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => upload(e, key, "images")}
      />
      {form?.[key] && (
        <div className="upload-preview">
          <img src={fileUrl(form[key])} alt={label} />
          <button type="button" onClick={() => setForm({ ...form, [key]: "" })}>
            Hapus gambar
          </button>
        </div>
      )}
    </label>
  );
  if (checking) return <p>Memeriksa sesi…</p>;
  if (!user)
    return (
      <section className="login-card">
        <small>PANEL PENGURUS</small>
        <h1>Masuk administrator</h1>
        <p>Kelola kitab, audio, dan identitas majelis.</p>
        <form onSubmit={login}>
          <label>
            Nama pengguna
            <input
              name="username"
              autoComplete="username"
              required
              maxLength="100"
            />
          </label>
          <label>
            Kata sandi
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary">
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </section>
    );
  return (
    <section className="admin">
      <div className="section-heading">
        <div>
          <small>PANEL PENGURUS</small>
          <h1>Kelola majelis</h1>
        </div>
        <button
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
            } catch (e) {
              fail(e);
            }
          }}
        >
          Keluar ({user.username})
        </button>
      </div>
      <nav className="admin-tabs">
        {Object.entries(titles).map(([key, title]) => (
          <button
            className={tab === key ? "primary" : ""}
            key={key}
            onClick={() => setTab(key)}
            disabled={busy}
          >
            {title}
          </button>
        ))}
      </nav>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <h2>{titles[tab]}</h2>
      {fetching ? (
        <p role="status">Memuat data…</p>
      ) : tab === "dashboard" ? (
        <>
          <div className="stats">
            <article>
              <b>{rows.books ?? 0}</b>
              <span>Kitab</span>
            </article>
            <article>
              <b>{rows.categories ?? 0}</b>
              <span>Kategori kitab</span>
            </article>
            <article>
              <b>{rows.audio ?? 0}</b>
              <span>Rekaman audio</span>
            </article>
          </div>
          <h3>Unggahan terakhir</h3>
          {rows.recent?.length ? (
            rows.recent.map((r) => (
              <p key={r.kind + r.id}>
                {r.title} · {r.kind === "books" ? "Kitab" : "Audio"} ·{" "}
                {r.published ? "Terbit" : "Draf"}
              </p>
            ))
          ) : (
            <p>Belum ada unggahan.</p>
          )}
        </>
      ) : (
        <>
          {tab !== "settings" && !form && (
            <button
              className="primary"
              onClick={() =>
                setForm(
                  tab === "books"
                    ? { ...blank }
                    : tab === "audio"
                      ? Object.fromEntries(
                          Object.entries(blank).filter(
                            ([k]) => k !== "direction",
                          ),
                        )
                      : tab === "playlists"
                        ? { name: "", audio_ids: [] }
                        : { name: "", position: 0 },
                )
              }
            >
              + Tambah {titles[tab].toLowerCase()}
            </button>
          )}
          {form && (
            <form className="admin-form" onSubmit={save}>
              <fieldset disabled={busy}>
                {tab === "settings" ? (
                  <>
                    <h3>Identitas aplikasi</h3>
                    {field("name", "Nama aplikasi", "text", {
                      required: true,
                      maxLength: 200,
                    })}
                    {field("description", "Deskripsi aplikasi")}
                    {image("logo", "Logo aplikasi")}
                    {field("primary", "Warna utama", "color")}
                    {field("secondary", "Warna aksen", "color")}
                    <h3>Beranda</h3>
                    {field("welcome", "Teks sambutan")}
                    <p>
                      Atur pilihan “Tampilkan di beranda” serta urutan pada
                      formulir kitab dan audio.
                    </p>
                    <h3>Layar pembuka</h3>
                    {check("splash_enabled", "Aktifkan layar pembuka")}
                    {image("splash_logo", "Logo layar pembuka")}
                    {image("splash_background", "Gambar latar pembuka")}
                    {field("splash_color", "Warna latar pembuka", "color")}
                    {field("splash_text", "Teks pembuka")}
                    {field("splash_duration", "Durasi (detik)", "number", {
                      min: 1,
                      max: 5,
                      step: 0.5,
                    })}
                  </>
                ) : tab === "books" || tab === "audio" ? (
                  <>
                    {field("title", "Judul", "text", {
                      required: true,
                      maxLength: 200,
                    })}
                    {field(
                      "author",
                      tab === "books"
                        ? "Penulis (opsional)"
                        : "Qari / pelantun",
                    )}
                    <label>
                      Deskripsi
                      <textarea
                        value={form.description}
                        maxLength="10000"
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Kategori
                      <select
                        value={form.category_id ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            category_id: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">Tanpa kategori</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {tab === "books" && (
                      <label>
                        Arah baca
                        <select
                          value={form.direction}
                          onChange={(e) =>
                            setForm({ ...form, direction: e.target.value })
                          }
                        >
                          <option value="rtl">Kanan ke kiri (RTL)</option>
                          <option value="ltr">Kiri ke kanan (LTR)</option>
                        </select>
                      </label>
                    )}
                    <label>
                      {tab === "books" ? "Berkas PDF" : "Berkas MP3"}
                      <input
                        type="file"
                        accept={tab === "books" ? ".pdf" : ".mp3"}
                        onChange={(e) => upload(e, "file", tab)}
                      />
                      <small>
                        {form.file
                          ? "Berkas tersedia: " + form.file
                          : "Unggah berkas sebelum menyimpan."}
                      </small>
                    </label>
                    {image("cover", "Gambar sampul")}
                    {field("position", "Urutan tampil", "number", { min: 0 })}
                    {check("published", "Terbitkan untuk umum")}
                    {check("downloadable", "Izinkan unduhan")}
                    {check("featured", "Tampilkan di beranda")}
                  </>
                ) : (
                  <>
                    {field("name", "Nama", "text", {
                      required: true,
                      maxLength: 120,
                    })}
                    {tab === "playlists" ? (
                      <div className="playlist-editor">
                        Audio dalam daftar putar{" "}
                        <small>Pilih audio, lalu gunakan tombol urutan.</small>
                        {audios.map((a) => (
                          <label className="check" key={a.id}>
                            <input
                              type="checkbox"
                              checked={form.audio_ids.includes(a.id)}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  audio_ids: e.target.checked
                                    ? [...form.audio_ids, a.id]
                                    : form.audio_ids.filter(
                                        (id) => id !== a.id,
                                      ),
                                })
                              }
                            />
                            {a.title}
                          </label>
                        ))}
                        <ol>
                          {form.audio_ids.map((id, i) => (
                            <li key={id}>
                              {audios.find((a) => a.id === id)?.title}{" "}
                              <button
                                type="button"
                                disabled={!i}
                                onClick={() => {
                                  const ids = [...form.audio_ids];
                                  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                                  setForm({ ...form, audio_ids: ids });
                                }}
                              >
                                Naik
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : (
                      field("position", "Urutan tampil", "number", { min: 0 })
                    )}
                  </>
                )}
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    {busy ? "Memproses…" : "Simpan perubahan"}
                  </button>
                  {tab !== "settings" && (
                    <button type="button" onClick={() => setForm(null)}>
                      Batal
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
          {tab !== "settings" && (
            <div className="admin-list">
              {Array.isArray(rows) && rows.length ? (
                rows.map((row) => (
                  <article key={row.id}>
                    <div>
                      <b>{row.title || row.name}</b>
                      <small>
                        {"published" in row
                          ? row.published
                            ? "Terbit"
                            : "Draf"
                          : ""}
                        {row.featured ? " · Pilihan beranda" : ""}
                      </small>
                    </div>
                    <button disabled={busy} onClick={() => setForm({ ...row })}>
                      Ubah
                    </button>
                    <button disabled={busy} onClick={() => remove(row)}>
                      Hapus
                    </button>
                  </article>
                ))
              ) : (
                <p>Belum ada data.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
