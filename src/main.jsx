import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  api,
  fileUrl,
  readLocal,
  saveLocal,
  downloadBook,
  isBookDownloaded,
} from "./api";
import Reader from "./reader";
import Admin from "./admin";
import Quran from "./quran";
import Home from "./home";
import BookLibrary from "./book-library";
import "./style.css";

const AudioContext = createContext();
const defaults = {
  name: "Kitab Majelis",
  description: "Teman ibadah dan sholawat Anda",
  primary: "#06634f",
  secondary: "#c19b4b",
};
function AudioProvider({ children }) {
  const ref = useRef(),
    [queue, setQueue] = useState([]),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [repeat, setRepeat] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState("");
  const current = queue[index];
  const start = (items, i = 0) => {
    if (!items[i]) return;
    setQueue(items);
    setIndex(i);
    setPlaying(true);
    setError("");
    if (current?.id === items[i]?.id) {
      ref.current.currentTime = 0;
      ref.current
        .play()
        .catch(() => setError("Ketuk putar untuk memulai audio."));
    }
  };
  const step = (d) => {
    if (queue.length) {
      setTime(0);
      setDuration(0);
      setError("");
      if (queue.length === 1) {
        ref.current.currentTime = 0;
        ref.current.play().catch(() => setPlaying(false));
        return;
      }
      setIndex((i) => (i + d + queue.length) % queue.length);
      setPlaying(true);
    }
  };
  useEffect(() => {
    if (current) {
      ref.current.load();
      ref.current.play().catch(() => {
        setPlaying(false);
        setError("Ketuk putar untuk memulai audio.");
      });
      setTime(0);
      setDuration(0);
      setError("");
      if ("mediaSession" in navigator && "MediaMetadata" in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: current.title,
          artist: current.author || "Majelis",
          artwork: current.cover
            ? [{ src: new URL(fileUrl(current.cover), location.origin).href }]
            : [],
        });
      }
    }
  }, [current?.id, current?.file]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const handlers = {
      play: () => ref.current.play().catch(() => setPlaying(false)),
      pause: () => ref.current.pause(),
      previoustrack: () => step(-1),
      nexttrack: () => step(1),
      seekto: (e) => {
        if (Number.isFinite(e.seekTime)) ref.current.currentTime = e.seekTime;
      },
    };
    for (const [k, v] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(k, v);
      } catch {}
    }
    return () => {
      for (const k of Object.keys(handlers))
        try {
          navigator.mediaSession.setActionHandler(k, null);
        } catch {}
    };
  }, [queue, index]);
  return (
    <AudioContext.Provider value={{ start, current }}>
      {children}
      <audio
        ref={ref}
        src={current ? fileUrl(current.file) : undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setTime(ref.current.currentTime)}
        onLoadedMetadata={() => setDuration(ref.current.duration)}
        onError={() => {
          setError("Audio tidak dapat diputar. Periksa berkas atau koneksi.");
          setPlaying(false);
        }}
        onEnded={() => {
          if (repeat) {
            ref.current.currentTime = 0;
            ref.current.play().catch(() => setPlaying(false));
          } else if (index < queue.length - 1) step(1);
          else setPlaying(false);
        }}
      />
      {current && (
        <aside className="player" aria-label="Pemutar audio">
          <div className="player-title">
            <b>{current.title}</b>
            <small>{current.author || "Audio majelis"}</small>
          </div>
          <div className="player-controls">
            <button onClick={() => step(-1)} aria-label="Audio sebelumnya">
              ⏮
            </button>
            <button
              className="primary"
              onClick={() =>
                playing
                  ? ref.current.pause()
                  : ref.current.play().catch(() => setError("Pemutaran gagal."))
              }
            >
              {playing ? "Jeda" : "Putar"}
            </button>
            <button onClick={() => step(1)} aria-label="Audio berikutnya">
              ⏭
            </button>
            <button aria-pressed={repeat} onClick={() => setRepeat(!repeat)}>
              Ulang {repeat ? "✓" : ""}
            </button>
            <label className="seek">
              {formatTime(time)}
              <input
                aria-label="Posisi audio"
                type="range"
                min="0"
                max={Number.isFinite(duration) ? duration : 0}
                value={time}
                onChange={(e) =>
                  (ref.current.currentTime = Number(e.target.value))
                }
              />
              {formatTime(duration)}
            </label>
          </div>
          {error && <small role="alert">{error}</small>}
        </aside>
      )}
    </AudioContext.Provider>
  );
}
function formatTime(t) {
  return Number.isFinite(t)
    ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
    : "0:00";
}
function Cover({ item }) {
  return item.cover ? (
    <img
      className="cover"
      src={fileUrl(item.cover)}
      alt={"Sampul " + item.title}
      loading="lazy"
    />
  ) : (
    <div className="cover cover-empty">
      <span>۞</span>
      <b>{item.title}</b>
    </div>
  );
}
function BookCard({ book, compact = false }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    isBookDownloaded(book).then((saved) => {
      if (active) setStatus(saved ? "Tersimpan offline" : "");
    });
    return () => {
      active = false;
    };
  }, [book.file]);
  return (
    <article className={`book-card ${compact ? "home-book-card" : ""}`}>
      <Link to={"/kitab/" + book.id} aria-label={`Buka kitab ${book.title}`}>
        <Cover item={book} />
        {!compact && book.featured && (
          <span className="library-featured-badge">✧ Pilihan majelis</span>
        )}
      </Link>
      <div className="card-body">
        <small>{book.category_name || "Kitab"}</small>
        <h3>
          <Link to={"/kitab/" + book.id}>{book.title}</Link>
        </h3>
        {!compact && book.author && (
          <p className="book-author">{book.author}</p>
        )}
        {!compact && <p className="description">{book.description}</p>}
        <div className="actions">
          <Link
            className="button primary"
            aria-label="Baca kitab"
            to={"/kitab/" + book.id}
          >
            Baca kitab
          </Link>
          {!compact && book.downloadable && (
            <button
              disabled={status === "Mengunduh…"}
              onClick={async () => {
                setStatus("Mengunduh…");
                try {
                  await downloadBook(book);
                  setStatus("Tersimpan offline");
                } catch (e) {
                  setStatus(e.message);
                }
              }}
            >
              Simpan offline
            </button>
          )}
        </div>
        {status && (
          <small
            role="status"
            className={`book-status ${status === "Tersimpan offline" ? "book-status-saved" : ""}`}
          >
            {status}
          </small>
        )}
      </div>
    </article>
  );
}
function AudioList({ items, compact = false }) {
  const { start, current } = useContext(AudioContext);
  if (compact)
    return (
      <div className="home-audio-list">
        {items.map((item, index) => (
          <article className="home-audio-row" key={item.id}>
            <button
              type="button"
              className="home-play"
              aria-label={`${current?.id === item.id ? "Putar ulang" : "Putar"}: ${item.title}`}
              onClick={() => start(items, index)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="m8 4 12 8-12 8V4Z" />
              </svg>
            </button>
            <div>
              <h3>{item.title}</h3>
              <p>{item.author || item.category_name || "Audio majelis"}</p>
            </div>
            <svg
              className="home-waveform"
              width="32"
              height="26"
              viewBox="0 0 32 26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M2 11v4m4-7v10m4-13v16m4-19v22m4-17v12m4-15v18m4-13v8m4-5v2" />
            </svg>
          </article>
        ))}
      </div>
    );
  return (
    <div className="audio-list">
      {items.map((item, i) => (
        <article className="audio-row" key={item.id}>
          <Cover item={item} />
          <div>
            <small>{item.category_name || "Audio Islami"}</small>
            <h3>{item.title}</h3>
            <p>{item.author || "Majelis"}</p>
          </div>
          <button className="primary" onClick={() => start(items, i)}>
            {current?.id === item.id ? "Putar lagi" : "Putar"}
          </button>
          {item.downloadable && (
            <a
              className="button"
              href={fileUrl(item.file) + "?download=true"}
              download
            >
              Unduh
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
function Library({ audio = false, data }) {
  const [params] = useSearchParams();
  useEffect(() => {
    setCategory(params.get("kategori") || "");
    setSearch("");
    setPlaylist("");
  }, [audio, params.get("kategori")]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(params.get("kategori") || ""),
    [playlist, setPlaylist] = useState("");
  const list = audio ? data.audio : data.books,
    categories = audio ? data.ac : data.bc;
  let items = list.filter(
    (x) =>
      x.title
        .toLocaleLowerCase("id")
        .includes(search.toLocaleLowerCase("id")) &&
      (!category || x.category_id === Number(category)),
  );
  if (audio && playlist) {
    const p = data.playlists.find((p) => p.id === Number(playlist));
    items = (p?.audio_ids || [])
      .map((id) => items.find((x) => x.id === id))
      .filter(Boolean);
  }
  return (
    <>
      <div className="page-heading">
        <small>KOLEKSI MAJELIS</small>
        <h1>{audio ? "Murotal & Sholawat" : "Perpustakaan Kitab"}</h1>
        <p>
          {audio
            ? "Dengarkan lantunan yang menenangkan hati."
            : "Baca, pelajari, dan amalkan bersama."}
        </p>
      </div>
      <div className="filters">
        <input
          aria-label="Cari judul"
          placeholder="Cari judul…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Kategori"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {audio && (
          <select
            aria-label="Daftar putar"
            value={playlist}
            onChange={(e) => setPlaylist(e.target.value)}
          >
            <option value="">Semua daftar putar</option>
            {data.playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!items.length ? (
        <Empty text="Belum ada koleksi yang sesuai." />
      ) : audio ? (
        <AudioList items={items} />
      ) : (
        <div className="book-grid">
          {items.map((b) => (
            <BookCard book={b} key={b.id} />
          ))}
        </div>
      )}
    </>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <span>۞</span>
      <p>{text}</p>
    </div>
  );
}
function App() {
  const [settings, setSettings] = useState({
      ...defaults,
      ...readLocal("settings", {}),
    }),
    [data, setData] = useState({
      books: [],
      audio: [],
      bc: [],
      ac: [],
      playlists: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [splash, setSplash] = useState(false);
  const launched = useRef(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, books, audio, bc, ac, playlists] = await Promise.all([
        api("/settings"),
        api("/public/books"),
        api("/public/audio"),
        api("/public/book-categories"),
        api("/public/audio-categories"),
        api("/public/playlists"),
      ]);
      setSettings(s);
      saveLocal("settings", s);
      const value = {
        books: books.map((b) => ({
          ...b,
          category_name: bc.find((c) => c.id === b.category_id)?.name,
        })),
        audio: audio.map((a) => ({
          ...a,
          category_name: ac.find((c) => c.id === a.category_id)?.name,
        })),
        bc,
        ac,
        playlists,
      };
      if (!navigator.onLine)
        value.books = [
          ...new Map(
            [
              ...value.books,
              ...Object.values(readLocal("offline-books", {})),
            ].map((book) => [book.id, book]),
          ).values(),
        ];
      setData(value);
      saveLocal("catalog", value);
      if (!launched.current) {
        launched.current = true;
        if (s.splash_enabled) {
          setSplash(true);
          setTimeout(() => setSplash(false), s.splash_duration * 1000);
        }
      }
    } catch (e) {
      const old = readLocal("catalog", null),
        offline = Object.values(readLocal("offline-books", {}));
      if (old)
        setData({
          ...old,
          books: [
            ...new Map(
              [...old.books, ...offline].map((b) => [b.id, b]),
            ).values(),
          ],
        });
      else setData((d) => ({ ...d, books: offline }));
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--primary", settings.primary);
    document.documentElement.style.setProperty("--gold", settings.secondary);
    document.title = settings.name;
  }, [settings]);
  return (
    <AudioProvider>
      <header className="site-header">
        <Link className="brand" to="/">
          {settings.logo ? (
            <img src={fileUrl(settings.logo)} alt="Logo majelis" />
          ) : (
            <span>۞</span>
          )}
          <div>
            <b>{settings.name}</b>
            <small>Kitab & lantunan untuk hati</small>
          </div>
        </Link>
        <div className="header-side">
          <small className={online ? "online" : "offline"}>
            {online ? "● Terhubung" : "● Mode offline"}
          </small>
          <Link to="/admin">Pengurus</Link>
        </div>
      </header>
      <main>
        {!online && (
          <div className="notice">
            Anda sedang offline. Kitab yang sudah disimpan dapat dibaca.
          </div>
        )}
        {error && (
          <div className="notice" role="alert">
            {error} <button onClick={load}>Coba lagi</button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              loading ? (
                <p>Memuat koleksi…</p>
              ) : (
                <Home
                  data={data}
                  settings={settings}
                  BookCard={BookCard}
                  AudioList={AudioList}
                />
              )
            }
          />
          <Route path="/alquran" element={<Quran />} />
          <Route path="/alquran/:id" element={<Quran />} />
          <Route
            path="/kitab"
            element={<BookLibrary data={data} BookCard={BookCard} />}
          />
          <Route
            path="/murotal"
            element={<Library key="audio" data={data} audio />}
          />
          <Route
            path="/kitab/:id"
            element={<Reader books={data.books} loading={loading} />}
          />
          <Route
            path="/admin/*"
            element={<Admin onChange={load} settings={settings} />}
          />
          <Route path="*" element={<Empty text="Halaman tidak ditemukan." />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Navigasi utama">
        <NavLink to="/" end>
          ⌂ <span>Beranda</span>
        </NavLink>
        <NavLink to="/alquran">
          ۞ <span>Al-Qur’an</span>
        </NavLink>
        <NavLink to="/kitab">
          ▤ <span>Kitab</span>
        </NavLink>
        <NavLink to="/murotal">
          ♫ <span>Murotal</span>
        </NavLink>
      </nav>
      {splash && (
        <div
          className="splash"
          style={{
            backgroundColor: settings.splash_color,
            backgroundImage: settings.splash_background
              ? `linear-gradient(#0005,#0005),url(${fileUrl(settings.splash_background)})`
              : undefined,
          }}
        >
          {(settings.splash_logo || settings.logo) && (
            <img
              src={fileUrl(settings.splash_logo || settings.logo)}
              alt="Logo pembuka"
            />
          )}
          <h1>{settings.name}</h1>
          <p>{settings.splash_text}</p>
        </div>
      )}
    </AudioProvider>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
