import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { api, readLocal, saveLocal } from "./api";

const validBookmark = (value) => value && Number.isInteger(value.chapter) && value.chapter >= 1 && value.chapter <= 114 && Number.isInteger(value.verse) && value.verse >= 1 && value.verse <= 286;

export default function Quran() {
  const { id } = useParams();
  const { hash } = useLocation();
  const [params] = useSearchParams();
  const chapterId = Number(id);
  const rawPage = Number(params.get("page") || 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 6 ? rawPage : 1;
  const validChapter = Number.isInteger(chapterId) && chapterId >= 1 && chapterId <= 114;
  const [chapters, setChapters] = useState([]);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [size, setSize] = useState(() => Math.min(48, Math.max(24, Number(readLocal("quran-font-size", 32)) || 32)));
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
          const result = await fetchSaved(`/quran/chapters/${chapterId}/verses?page=${page}`, `quran-verses-v1-${chapterId}-${page}`);
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
    return () => { active = false; };
  }, [id, page, retry]);

  useEffect(() => {
    if (!content || loading) return;
    const target = hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: 0 });
  }, [content, loading, hash]);

  function mark(verse) {
    const saved = { chapter: chapterId, verse: verse.verse_number, name: chapter?.name_simple || `Surah ${chapterId}` };
    saveLocal("quran-bookmark", saved);
    setBookmark(saved);
  }
  const chapter = chapters.find((item) => item.id === chapterId);
  const filtered = chapters.filter((item) => `${item.id} ${item.name_simple} ${item.name_arabic}`.toLowerCase().includes(query.toLowerCase().trim()));
  const continueUrl = bookmark ? `/alquran/${bookmark.chapter}?page=${Math.ceil(bookmark.verse / 50)}#ayat-${bookmark.verse}` : "";

  return (
    <section className="quran-section" translate="no">
      <header className="quran-heading">
        <div><small>BACAAN UNTUK HATI</small><h1>{id && chapter ? chapter.name_simple : "Al-Qur’an"}</h1>
          <p>{id && chapter ? `${chapter.verses_count} ayat · ${chapter.revelation_place === "makkah" ? "Makkiyah" : "Madaniyah"}` : "Baca ayat suci beserta terjemahan Bahasa Indonesia."}</p>
        </div>
        {id && <Link className="button" to="/alquran">Daftar surah</Link>}
      </header>
      {bookmark && <Link className="quran-resume" to={continueUrl}>☆ Lanjutkan bacaan: {bookmark.name}, ayat {bookmark.verse}</Link>}
      {cached && <p className="notice" role="status">Menampilkan salinan bacaan yang pernah dibuka. Sambungan ke sumber sedang tidak tersedia.</p>}
      {loading ? <p role="status">Memuat Al-Qur’an…</p> : error ? (
        <div className="notice" role="alert">{error} <button onClick={() => setRetry((n) => n + 1)}>Coba lagi</button></div>
      ) : !id ? (
        <>
          <label className="quran-search">Cari surah<input type="search" value={query} placeholder="Nama atau nomor surah" onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="quran-chapters">{filtered.map((item) => (
            <Link className="quran-chapter" key={item.id} to={`/alquran/${item.id}`}>
              <span className="quran-number">{item.id}</span>
              <span><b>{item.name_simple}</b><small>{item.verses_count} ayat</small></span>
              <span lang="ar" dir="rtl" className="quran-surah-arabic">{item.name_arabic}</span>
            </Link>
          ))}</div>
          {!filtered.length && <p>Surah tidak ditemukan. Coba nama atau nomor lain.</p>}
        </>
      ) : content && (
        <>
          <div className="quran-controls">
            <label className="check"><input type="checkbox" checked={translation} onChange={(e) => setTranslation(e.target.checked)} />Terjemahan Indonesia</label>
            <label>Ukuran teks Arab<input aria-label="Ukuran teks Arab" type="range" min="24" max="48" value={size} onChange={(e) => { setSize(Number(e.target.value)); saveLocal("quran-font-size", Number(e.target.value)); }} /></label>
          </div>
          <div className="quran-verses">{content.verses.map((verse) => (
            <article className="quran-verse" id={`ayat-${verse.verse_number}`} key={verse.verse_key}>
              <div className="quran-verse-heading"><b>{verse.verse_key}</b><button type="button" aria-pressed={bookmark?.chapter === chapterId && bookmark?.verse === verse.verse_number} onClick={() => mark(verse)}>
                {bookmark?.chapter === chapterId && bookmark?.verse === verse.verse_number ? "★ Ditandai" : "☆ Tandai ayat"}
              </button></div>
              <p className="quran-arabic" lang="ar" dir="rtl" style={{ fontSize: `${size}px` }}>{verse.text_uthmani}</p>
              {translation && <p className="quran-translation" lang="id">{verse.translation}</p>}
            </article>
          ))}</div>
          <nav className="quran-pagination" aria-label="Halaman ayat">
            {page > 1 && <Link className="button" to={`/alquran/${chapterId}?page=${page - 1}`}>Sebelumnya</Link>}
            <span>Halaman {content.pagination.current_page} dari {content.pagination.total_pages}</span>
            {content.pagination.next_page && <Link className="button" to={`/alquran/${chapterId}?page=${content.pagination.next_page}`}>Berikutnya</Link>}
          </nav>
          {translation && <p className="quran-credit">Terjemahan: {content.translation.name}{content.translation.author_name ? ` · ${content.translation.author_name}` : ""}. Penanda catatan kaki tidak ditampilkan.</p>}
        </>
      )}
      <p className="quran-credit">Sumber bacaan: <a href="https://quran.foundation" target="_blank" rel="noreferrer">Quran.Foundation</a>. Penanda disimpan di perangkat ini.</p>
    </section>
  );
}
