import React, { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, readLocal, saveLocal } from "./api";
import "./quran.css";
import "./mushaf.css";
import "./quran-directory.css";

const validBookmark = (value) =>
  value &&
  Number.isInteger(value.chapter) &&
  value.chapter >= 1 &&
  value.chapter <= 114 &&
  Number.isInteger(value.verse) &&
  value.verse >= 1 &&
  value.verse <= 286;

function Icon({ name, ...props }) {
  const paths = {
    book: (
      <>
        <path d="M12 5C8 2 4 3 2 4v15c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1Z" />
        <path d="M12 5v14M5 7l4 1M5 11l4 1m6-4 4-1m-4 5 4-1" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    settings: (
      <>
        <path d="M3 6h18M3 12h18M3 18h18" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

function MushafCorner({ position }) {
  return (
    <svg
      className={`mushaf-corner mushaf-corner-${position}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 96V4h92v12H69c-5 24-29 48-53 53v27H4Z"
        fill="#165346"
        stroke="#b08b3d"
        strokeWidth="1.5"
      />
      <path
        d="M10 87V10h77M19 59c21-6 34-19 40-40"
        stroke="#dfc277"
        strokeWidth="1.2"
      />
      <path
        d="m29 14 5 8 9 1-6 7 1 9-9-4-8 4 1-9-6-7 9-1 4-8Zm-1 29 4 5 7 1-5 5v7l-6-3-6 3v-7l-5-5 7-1 4-5Z"
        fill="#d9b968"
      />
      <path
        d="M14 45c10-4 13-10 13-19m20-12c-4 10-10 13-19 13M14 65c15-5 33-23 39-39"
        stroke="#e8d39d"
        strokeWidth="1.1"
      />
      <circle cx="14" cy="14" r="4" fill="#ddbb67" />
      <circle cx="42" cy="42" r="3" fill="#ddbb67" />
    </svg>
  );
}

function ChapterNavigation({ previous, next, currentId, top = false }) {
  const item = (chapter, forward) => {
    const content = (
      <>
        <span
          className={`mushaf-nav-arrow ${forward ? "" : "mushaf-arrow-back"}`}
        >
          <Icon name="arrow" />
        </span>
        <span>
          <small>{forward ? "Surah berikutnya" : "Surah sebelumnya"}</small>
          <b>
            {chapter?.name_simple ||
              (forward
                ? currentId === 114
                  ? "Surah terakhir"
                  : "Belum tersedia"
                : currentId === 1
                  ? "Surah pertama"
                  : "Belum tersedia")}
          </b>
        </span>
      </>
    );
    return chapter ? (
      <Link
        className={`mushaf-nav-link ${forward ? "mushaf-nav-next" : ""}`}
        to={`/alquran/${chapter.id}`}
        aria-label={`${forward ? "Surah berikutnya" : "Surah sebelumnya"}: ${chapter.name_simple}`}
      >
        {content}
      </Link>
    ) : (
      <button
        className={`mushaf-nav-link ${forward ? "mushaf-nav-next" : ""}`}
        type="button"
        disabled
      >
        {content}
      </button>
    );
  };
  return (
    <nav
      className={`mushaf-chapter-navigation ${top ? "mushaf-navigation-top" : ""}`}
      aria-label={top ? "Navigasi surah di atas" : "Pindah ke surah lain"}
    >
      {item(previous, false)}
      {item(next, true)}
    </nav>
  );
}

function DirectoryCorners() {
  return (
    <span className="directory-corners" aria-hidden="true">
      {["tl", "tr", "br", "bl"].map((position) => (
        <svg
          className={`directory-corner directory-corner-${position}`}
          key={position}
          viewBox="0 0 48 48"
          fill="none"
        >
          <path
            d="M2 44V2h42M6 30V6h24M10 19c8 0 9-9 15-9m-15 15c9-2 13-6 15-15M8 37c15-2 27-14 29-29"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path
            d="m12 7 2 4 4 1-4 2-2 4-1-4-4-2 4-1 1-4Zm14 4 2 3 4 1-4 2-2 3-1-3-4-2 4-1 1-3Zm-15 15 2 3 4 1-4 2-2 3-1-3-4-2 4-1 1-3Z"
            fill="currentColor"
          />
          <circle cx="7" cy="7" r="2" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

function DirectoryBook() {
  return (
    <div className="directory-book" aria-hidden="true">
      <span className="directory-book-halo" />
      <svg viewBox="0 0 280 210" fill="none">
        <path
          d="m45 176 106 17 98-64-107-13-97 60Z"
          fill="#052f28"
          opacity=".6"
        />
        <path
          d="m72 155 72 27 91-59-68-29-95 61Z"
          fill="#815a31"
          stroke="#d5b66a"
        />
        <path
          d="m86 159 60 17 79-51-60-24-79 58Z"
          fill="#eddbb0"
          stroke="#b59453"
        />
        <path
          d="m78 150 89-111 66 37-89 107-66-33Z"
          fill="#d0b36e"
          stroke="#e9d09b"
          strokeWidth="2"
        />
        <path
          d="m74 141 87-113 69 38-89 114-67-39Z"
          fill="#145346"
          stroke="#d4b676"
          strokeWidth="2"
        />
        <path
          d="m87 137 77-98 54 29-78 101-53-32Z"
          stroke="#cdb476"
          strokeWidth="1.4"
        />
        <path
          d="m97 132 69-86 42 24-69 88-42-26Z"
          stroke="#cdb476"
          strokeWidth=".8"
          strokeDasharray="2 3"
        />
        <path
          d="m134 115 7-18 16-15 9 3 3 11-8 18-16 14-8-3-3-10Z"
          fill="#b49250"
        />
        <path
          d="m141 113 4-13 11-11 5 2 2 7-6 14-11 10-4-2-1-7Z"
          fill="#1b5b48"
          stroke="#dfc282"
        />
        <path
          d="m164 43 9 5-6 8-3-13Zm-68 88 9 5-7 8-2-13Zm100-56 8 4-6 8-2-12Zm-61 77 9 5-7 8-2-13Z"
          fill="#c9aa64"
        />
        <path
          d="m73 141 67 39 3 8-69-39-1-8Z"
          fill="#093a31"
          stroke="#bc9e59"
        />
      </svg>
    </div>
  );
}

export default function Quran() {
  const { id } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const chapterId = Number(id);
  const rawPage = Number(params.get("page") || 1);
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 6 ? rawPage : 1;
  const validChapter =
    Number.isInteger(chapterId) && chapterId >= 1 && chapterId <= 114;
  const [chapters, setChapters] = useState([]);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [jump, setJump] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [size, setSize] = useState(() =>
    Math.min(48, Math.max(24, Number(readLocal("quran-font-size", 36)) || 36)),
  );
  const [translation, setTranslation] = useState(true);
  const [bookmark, setBookmark] = useState(() => {
    const saved = readLocal("quran-bookmark", null);
    return validBookmark(saved) ? saved : null;
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setCached(false);
    setContent(null);
    async function fetchSaved(path, key) {
      try {
        const result = await api(path);
        saveLocal(key, result);
        return result;
      } catch (error) {
        const saved = readLocal(key, null);
        if (!saved) throw error;
        if (active) setCached(true);
        return saved;
      }
    }
    async function load() {
      try {
        if (id && !validChapter) throw Error("Surah tidak ditemukan.");
        const list = await fetchSaved("/quran/chapters", "quran-chapters-v1");
        if (!active) return;
        setChapters(list.chapters);
        if (id) {
          const result = await fetchSaved(
            `/quran/chapters/${chapterId}/verses?page=${page}`,
            `quran-verses-v1-${chapterId}-${page}`,
          );
          if (!active) return;
          setContent(result);
        }
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [id, page, retry]);

  useEffect(() => {
    if (!content || loading) return;
    const target = hash.slice(1);
    if (target)
      document.getElementById(target)?.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: 0 });
  }, [content, loading, hash]);

  function mark(verse) {
    if (
      bookmark?.chapter === chapterId &&
      bookmark?.verse === verse.verse_number
    ) {
      saveLocal("quran-bookmark", null);
      setBookmark(null);
      return;
    }
    const saved = {
      chapter: chapterId,
      verse: verse.verse_number,
      name: chapter?.name_simple || `Surah ${chapterId}`,
    };
    saveLocal("quran-bookmark", saved);
    setBookmark(saved);
  }
  const chapter = chapters.find((item) => item.id === chapterId);
  const filtered = chapters.filter(
    (item) =>
      (filter === "all" || item.revelation_place === filter) &&
      `${item.id} ${item.name_simple} ${item.name_arabic}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const continueUrl = bookmark
    ? `/alquran/${bookmark.chapter}?page=${Math.ceil(bookmark.verse / 50)}#ayat-${bookmark.verse}`
    : "";
  const previousChapter = chapters.find((item) => item.id === chapterId - 1);
  const nextChapter = chapters.find((item) => item.id === chapterId + 1);
  function jumpToVerse(event) {
    event.preventDefault();
    const verse = Number(jump);
    if (!Number.isInteger(verse) || verse < 1 || verse > chapter.verses_count)
      return;
    navigate(
      `/alquran/${chapterId}?page=${Math.ceil(verse / 50)}#ayat-${verse}`,
    );
    document
      .getElementById(`ayat-${verse}`)
      ?.scrollIntoView({ block: "center" });
  }

  return (
    <section
      className={`quran-section ${id ? "quran-reading" : "quran-library"}`}
      translate="no"
    >
      {id ? (
        <nav className="quran-breadcrumb" aria-label="Lokasi pembaca">
          <Link to="/alquran">
            <Icon name="book" />
            Daftar surah
          </Link>
          <span>/</span>
          <span>{chapter?.name_simple || "Pembaca Al-Qur’an"}</span>
        </nav>
      ) : null}
      <header className={`quran-hero ${id ? "quran-reader-hero" : ""}`}>
        <div className="quran-hero-copy">
          <span className="quran-eyebrow">
            <span />
            {id ? "RUANG BACA AL-QUR’AN" : "AL-QUR’AN DIGITAL"}
          </span>
          <h1>{id && chapter ? chapter.name_simple : "Daftar Surah"}</h1>
          <p>
            {id && chapter
              ? "Luangkan waktu sejenak. Baca, pahami, dan resapi setiap ayat."
              : "Temukan surah, lanjutkan bacaan, dan dekatkan hati melalui setiap ayat."}
          </p>
          <div className="quran-hero-meta">
            {id && chapter ? (
              <>
                <span>Surah ke-{chapter.id}</span>
                <i />
                <span>{chapter.verses_count} ayat</span>
                <i />
                <span>
                  {chapter.revelation_place === "makkah"
                    ? "Makkiyah"
                    : "Madaniyah"}
                </span>
              </>
            ) : (
              <>
                <span>
                  <Icon name="book" />
                  {chapters.length || "—"} surah
                </span>
                <span>Terjemahan Indonesia</span>
              </>
            )}
          </div>
        </div>
        {id && chapter ? (
          <div className="quran-reader-seal">
            <span className="quran-seal-star">۞</span>
            <p lang="ar" dir="rtl">
              {chapter.name_arabic}
            </p>
            <small>{String(chapter.id).padStart(3, "0")}</small>
          </div>
        ) : (
          <DirectoryBook />
        )}
        {!id && <DirectoryCorners />}
      </header>
      {bookmark && (
        <Link
          className="quran-resume"
          to={continueUrl}
          aria-label={`Lanjutkan bacaan: ${bookmark.name}, ayat ${bookmark.verse}`}
        >
          <span className="quran-resume-icon">
            <Icon name="bookmark" />
          </span>
          <span>
            <small>Lanjutkan bacaan</small>
            <b>
              {bookmark.name}
              <span> · Ayat {bookmark.verse}</span>
            </b>
            <span className="directory-resume-caption">
              Penanda bacaan Anda
            </span>
          </span>
          <span className="quran-resume-action">
            Lanjutkan <Icon name="arrow" />
          </span>
          {!id && <DirectoryCorners />}
        </Link>
      )}
      {cached && (
        <p className="notice" role="status">
          Menampilkan salinan bacaan yang pernah dibuka. Sambungan ke sumber
          sedang tidak tersedia.
        </p>
      )}
      {loading ? (
        <div className="quran-loading" role="status">
          <Icon name="book" />
          <p>Memuat Al-Qur’an…</p>
          <span>Menyiapkan bacaan untuk Anda</span>
        </div>
      ) : error ? (
        <div className="quran-error" role="alert">
          <Icon name="book" />
          <h2>Bacaan belum tersedia</h2>
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Coba lagi</button>
        </div>
      ) : !id ? (
        <>
          <div className="directory-toolbar">
            <div className="quran-catalog-heading">
              <label className="quran-search">
                <span className="quran-sr-only">Cari surah</span>
                <Icon name="search" />
                <input
                  type="search"
                  value={query}
                  placeholder="Cari nama atau nomor surah…"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <div className="quran-filterbar">
              <div
                className="quran-filters"
                role="group"
                aria-label="Filter tempat diturunkan"
              >
                {[
                  ["all", "Semua surah"],
                  ["makkah", "Makkiyah"],
                  ["madinah", "Madaniyah"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span>{filtered.length} surah</span>
            </div>
          </div>
          <div className="quran-chapters">
            {filtered.map((item) => (
              <Link
                className={`quran-chapter ${bookmark?.chapter === item.id ? "directory-chapter-marked" : ""}`}
                key={item.id}
                to={`/alquran/${item.id}`}
              >
                <DirectoryCorners />
                <span className="quran-number">
                  <span>{item.id}</span>
                </span>
                <span className="directory-card-arrow">
                  <Icon name="arrow" />
                </span>
                <span className="quran-chapter-info">
                  <b>{item.name_simple}</b>
                  <small>
                    {item.revelation_place === "makkah"
                      ? "Makkiyah"
                      : "Madaniyah"}
                    <span> · </span>
                    {item.verses_count} ayat
                  </small>
                </span>
                <span className="quran-chapter-end">
                  <span lang="ar" dir="rtl" className="quran-surah-arabic">
                    {item.name_arabic}
                  </span>
                  {bookmark?.chapter === item.id && (
                    <span className="quran-marked">
                      <Icon name="bookmark" />
                      Ditandai
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
          {!filtered.length && (
            <div className="quran-empty">
              <Icon name="search" />
              <h3>Surah tidak ditemukan</h3>
              <p>Coba nama, nomor, atau filter lainnya.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Tampilkan semua surah
              </button>
            </div>
          )}
        </>
      ) : (
        content && (
          <>
            <div className="quran-reader-layout">
              <aside
                className={`quran-reader-sidebar ${navigationOpen ? "mushaf-sidebar-open" : ""}`}
              >
                <button
                  className="mushaf-mobile-tools"
                  type="button"
                  aria-expanded={navigationOpen}
                  aria-controls="mushaf-navigation-panel"
                  onClick={() => setNavigationOpen((open) => !open)}
                >
                  <Icon name="settings" />
                  Pilih surah & ayat
                  <span aria-hidden="true">{navigationOpen ? "−" : "+"}</span>
                </button>
                <div
                  className="quran-sidebar-panel"
                  id="mushaf-navigation-panel"
                >
                  <span className="quran-kicker">NAVIGASI BACAAN</span>
                  <h2>Pilih surah</h2>
                  <label>
                    <span className="quran-sr-only">Pindah surah</span>
                    <select
                      value={chapterId}
                      onChange={(e) => {
                        setJump("");
                        navigate(`/alquran/${e.target.value}`);
                      }}
                    >
                      {chapters.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id}. {item.name_simple}
                        </option>
                      ))}
                    </select>
                  </label>
                  {chapter && (
                    <form className="quran-jump" onSubmit={jumpToVerse}>
                      <label htmlFor="quran-verse-jump">Lompat ke ayat</label>
                      <div>
                        <input
                          id="quran-verse-jump"
                          type="number"
                          min="1"
                          max={chapter.verses_count}
                          required
                          placeholder={`1–${chapter.verses_count}`}
                          value={jump}
                          onChange={(e) => setJump(e.target.value)}
                        />
                        <button type="submit" aria-label="Buka ayat">
                          <Icon name="arrow" />
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="quran-sidebar-note">
                    <Icon name="bookmark" />
                    <p>Tandai ayat untuk melanjutkan bacaan di lain waktu.</p>
                  </div>
                </div>
                {bookmark && (
                  <Link
                    className="mushaf-saved-card"
                    to={continueUrl}
                    aria-label={`Lanjut ke penanda ${bookmark.name}, ayat ${bookmark.verse}`}
                  >
                    <span className="mushaf-saved-title">
                      <Icon name="bookmark" />
                      Penanda Anda
                    </span>
                    <b>
                      {bookmark.name} · Ayat {bookmark.verse}
                    </b>
                    <span>
                      Lanjutkan membaca <Icon name="arrow" />
                    </span>
                  </Link>
                )}
                <div className="quran-source-note">
                  <span>SUMBER BACAAN</span>
                  <b>Quran.Foundation</b>
                  <p>Sumber teks Al-Qur’an dan terjemahan yang Anda baca.</p>
                </div>
              </aside>
              <div className="quran-reader-main">
                <ChapterNavigation
                  previous={previousChapter}
                  next={nextChapter}
                  currentId={chapterId}
                  top
                />
                <div className="quran-paper">
                  {["tl", "tr", "bl", "br"].map((position) => (
                    <MushafCorner key={position} position={position} />
                  ))}
                  <header className="mushaf-surah-heading">
                    <div className="mushaf-surah-titles">
                      <h1>{chapter?.name_simple || `Surah ${chapterId}`}</h1>
                      <span aria-hidden="true" />
                      <p lang="ar" dir="rtl">
                        {chapter?.name_arabic}
                      </p>
                    </div>
                    <p className="mushaf-surah-meta">
                      Surah {chapterId}
                      <span>◆</span>
                      {chapter?.verses_count} ayat<span>◆</span>
                      {chapter?.revelation_place === "makkah"
                        ? "Makkiyah"
                        : "Madaniyah"}
                    </p>
                  </header>
                  <div className="quran-controls">
                    <span className="quran-control-title">
                      <Icon name="settings" />
                      Tampilan bacaan
                    </span>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={translation}
                        onChange={(e) => setTranslation(e.target.checked)}
                      />
                      Terjemahan Indonesia
                    </label>
                    <label className="quran-font-control">
                      <span className="quran-sr-only">Ukuran teks Arab</span>
                      <span aria-hidden="true">A</span>
                      <input
                        aria-label="Ukuran teks Arab"
                        type="range"
                        min="24"
                        max="48"
                        value={size}
                        onChange={(e) => {
                          setSize(Number(e.target.value));
                          saveLocal("quran-font-size", Number(e.target.value));
                        }}
                      />
                      <span aria-hidden="true">A</span>
                    </label>
                  </div>
                  <div className="quran-verses">
                    {content.verses.map((verse) => (
                      <article
                        className={`quran-verse ${bookmark?.chapter === chapterId && bookmark?.verse === verse.verse_number ? "quran-verse-marked" : ""}`}
                        id={`ayat-${verse.verse_number}`}
                        key={verse.verse_key}
                      >
                        <div className="quran-verse-heading">
                          <b
                            className="mushaf-verse-number"
                            aria-label={`Ayat ${verse.verse_key}`}
                          >
                            <span>{verse.verse_number}</span>
                          </b>
                          <button
                            type="button"
                            className="mushaf-bookmark-button"
                            aria-label={
                              bookmark?.chapter === chapterId &&
                              bookmark?.verse === verse.verse_number
                                ? "★ Ditandai"
                                : "☆ Tandai ayat"
                            }
                            aria-pressed={
                              bookmark?.chapter === chapterId &&
                              bookmark?.verse === verse.verse_number
                            }
                            onClick={() => mark(verse)}
                          >
                            <Icon name="bookmark" />
                            {bookmark?.chapter === chapterId &&
                            bookmark?.verse === verse.verse_number
                              ? "Ditandai"
                              : "Tandai ayat"}
                          </button>
                        </div>
                        <p
                          className="quran-arabic"
                          lang="ar"
                          dir="rtl"
                          style={{ fontSize: `${size}px` }}
                        >
                          {verse.text_uthmani}
                        </p>
                        {translation && (
                          <p className="quran-translation" lang="id">
                            {verse.translation}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
                <nav className="quran-pagination" aria-label="Halaman ayat">
                  {page > 1 && (
                    <Link
                      className="button"
                      to={`/alquran/${chapterId}?page=${page - 1}`}
                    >
                      Sebelumnya
                    </Link>
                  )}
                  <span>
                    <small>HALAMAN BACAAN</small>Halaman{" "}
                    {content.pagination.current_page} dari{" "}
                    {content.pagination.total_pages}
                  </span>
                  {content.pagination.next_page && (
                    <Link
                      className="button"
                      to={`/alquran/${chapterId}?page=${content.pagination.next_page}`}
                    >
                      Berikutnya
                    </Link>
                  )}
                </nav>
                {translation && (
                  <p className="quran-credit">
                    Terjemahan: {content.translation.name}
                    {content.translation.author_name
                      ? ` · ${content.translation.author_name}`
                      : ""}
                    . Penanda catatan kaki tidak ditampilkan.
                  </p>
                )}
                <ChapterNavigation
                  previous={previousChapter}
                  next={nextChapter}
                  currentId={chapterId}
                />
              </div>
            </div>
          </>
        )
      )}
      <footer className="quran-footer">
        <Icon name="book" />
        <p>
          Sumber bacaan:{" "}
          <a href="https://quran.foundation" target="_blank" rel="noreferrer">
            Quran.Foundation
          </a>
          <span> · Penanda disimpan di perangkat ini.</span>
        </p>
        <span className="quran-footer-flower" aria-hidden="true">
          ✧
        </span>
      </footer>
    </section>
  );
}
