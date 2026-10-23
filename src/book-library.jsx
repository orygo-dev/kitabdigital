import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { readLocal } from "./api";
import "./book-library.css";

function LibraryIcon({ arrow = false }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {arrow ? (
        <path d="M4 12h16m-6-6 6 6-6 6" />
      ) : (
        <>
          <path d="m3 6 9-4 9 4-9 4-9-4Zm0 6 9 4 9-4M3 18l9 4 9-4" />
          <path d="M3 6v4m18-4v4M3 12v4m18-4v4" />
        </>
      )}
    </svg>
  );
}

function LibraryBooks() {
  return (
    <svg
      className="library-books-art"
      viewBox="0 0 260 190"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="139" cy="167" rx="102" ry="12" fill="#052f2866" />
      <path d="m45 128 111 20 69-40-110-20-70 40Z" fill="#d7bd83" />
      <path d="m45 128 111 20v19L45 147v-19Z" fill="#9b773a" />
      <path d="m156 148 69-40v19l-69 40v-19Z" fill="#eddbb1" />
      <path
        d="m38 120 113 20 80-43-115-21-78 44Z"
        fill="#14493c"
        stroke="#d9bf7d"
        strokeWidth="2"
      />
      <path d="m48 124 103 18v18L48 142v-18Z" stroke="#cfb16d" />
      <path d="m67 100 101 18 64-38-100-18-65 38Z" fill="#d9bd81" />
      <path d="m67 100 101 18v15L67 115v-15Z" fill="#7c5930" />
      <path d="m168 118 64-38v15l-64 38v-15Z" fill="#f4e6c3" />
      <path
        d="m62 94 105 19 73-41-106-20-72 42Z"
        fill="#765a34"
        stroke="#d0af6b"
        strokeWidth="2"
      />
      <path d="m86 85 93 17 53-32-93-16-53 31Z" stroke="#d4bb7e" />
      <path d="m95 71 77 15 54-32-77-15-54 32Z" fill="#e7d4a8" />
      <path d="m95 71 77 15v11L95 82V71Z" fill="#b18c47" />
      <path d="m172 86 54-32v11l-54 32V86Z" fill="#f3e5c0" />
      <path
        d="m91 64 81 16 60-35-82-15-59 34Z"
        fill="#185b49"
        stroke="#d8bc78"
        strokeWidth="2"
      />
      <path d="m105 61 66 13 46-27-66-12-46 26Z" stroke="#d9bb78" />
      <path d="m150 49 10-6 12 2 4 5-9 6-12-2-5-5Z" fill="#c8a35d" />
      <path d="m171 80 9-5v45l-5-5-4 8V80Z" fill="#b9964e" />
    </svg>
  );
}

export default function BookLibrary({ data, BookCard }) {
  const [params] = useSearchParams();
  const [category, setCategory] = useState(params.get("kategori") || "");
  const [search, setSearch] = useState("");
  const searchInput = useRef(null);
  useEffect(() => {
    setCategory(params.get("kategori") || "");
    setSearch("");
  }, [params.get("kategori")]);
  const items = data.books.filter(
    (book) =>
      `${book.title} ${book.author || ""}`
        .toLocaleLowerCase("id")
        .includes(search.toLocaleLowerCase("id").trim()) &&
      (!category || book.category_id === Number(category)),
  );
  const progress = readLocal("reading-progress", {});
  const continued = data.books
    .filter(
      (book) =>
        Number.isInteger(progress[book.id]?.page) && progress[book.id].page > 0,
    )
    .sort(
      (a, b) =>
        (Number(progress[b.id].updated) || 0) -
        (Number(progress[a.id].updated) || 0),
    )[0];
  const clear = () => {
    setSearch("");
    setCategory("");
    searchInput.current?.focus();
  };
  return (
    <section className="library-page">
      <header className="library-welcome">
        <div>
          <span className="library-eyebrow">RUANG BACA MAJELIS</span>
          <h1>Perpustakaan Kitab</h1>
          <p>Temukan bacaan pilihan. Baca, pelajari, dan amalkan bersama.</p>
          <div className="library-facts">
            <span>
              <LibraryIcon />
              {data.books.length} kitab
            </span>
            <span>{data.bc.length} kategori</span>
            <span>Simpan untuk dibaca offline</span>
          </div>
        </div>
        <LibraryBooks />
      </header>
      {continued && (
        <Link className="library-continue" to={`/kitab/${continued.id}`}>
          <span className="library-continue-icon">
            <LibraryIcon />
          </span>
          <span>
            <small>LANJUTKAN BACAAN ANDA</small>
            <b>{continued.title}</b>
            <span>Halaman {progress[continued.id].page}</span>
          </span>
          <span className="library-continue-action">
            Lanjutkan <LibraryIcon arrow />
          </span>
        </Link>
      )}
      <div className="library-collection-heading">
        <div>
          <span className="library-eyebrow">KOLEKSI MAJELIS</span>
          <h2>Pilih teman membaca Anda</h2>
        </div>
        <p>{items.length} kitab ditampilkan</p>
      </div>
      <div className="library-filters">
        <label className="library-search">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="6.5" />
            <path d="m15 15 6 6" />
          </svg>
          <input
            ref={searchInput}
            aria-label="Cari judul"
            type="search"
            placeholder="Cari judul kitab atau penulis…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="library-category">
          <span>Kategori</span>
          <select
            aria-label="Kategori"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Semua kategori</option>
            {data.bc.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data.bc.length > 0 && (
        <div
          className="library-category-tabs"
          role="group"
          aria-label="Jelajahi kategori kitab"
        >
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => setCategory("")}
          >
            Semua kitab
          </button>
          {data.bc.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === String(item.id)}
              onClick={() => setCategory(String(item.id))}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {items.length ? (
        <div className="book-grid library-book-grid">
          {items.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <LibraryIcon />
          <h3>
            {data.books.length
              ? "Kitab tidak ditemukan"
              : "Koleksi kitab segera hadir"}
          </h3>
          <p>
            {data.books.length
              ? "Coba judul, nama penulis, atau kategori lainnya."
              : "Pengurus sedang menyiapkan koleksi bacaan untuk majelis."}
          </p>
          {data.books.length ? (
            <button type="button" onClick={clear}>
              Tampilkan semua kitab <LibraryIcon arrow />
            </button>
          ) : (
            <Link className="button" to="/alquran">
              Baca Al-Qur’an <LibraryIcon arrow />
            </Link>
          )}
        </div>
      )}
      <footer className="library-footer">
        <LibraryIcon />
        <p>
          Bacaan untuk menemani ibadah.
          <span> Simpan kitab yang diizinkan untuk dibaca saat offline.</span>
        </p>
        <span aria-hidden="true">✧</span>
      </footer>
    </section>
  );
}
