import React from "react";
import { Link } from "react-router-dom";
import { readLocal } from "./api";
import welcomeArt from "./assets/home-welcome.png";
import "./home.css";

function HomeIcon({ name }) {
  const paths = {
    book: (
      <>
        <path d="M12 5C8 2 4 3 2 4v15c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1Z" />
        <path d="M12 5v14M5 7l4 1m6 0 4-1M5 11l4 1m6 0 4-1" />
      </>
    ),
    library: (
      <>
        <path d="m3 6 9-4 9 4-9 4-9-4Zm0 6 9 4 9-4M3 18l9 4 9-4" />
        <path d="M3 6v4m18-4v4M3 12v4m18-4v4" />
      </>
    ),
    audio: (
      <>
        <path d="M9 18V5l11-2v13M9 8l11-2" />
        <ellipse cx="6" cy="18" rx="3" ry="2.5" />
        <ellipse cx="17" cy="16" rx="3" ry="2.5" />
      </>
    ),
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function HomeCorners() {
  return (
    <span className="home-corners" aria-hidden="true">
      {["tl", "tr", "br", "bl"].map((position) => (
        <svg
          className={`home-corner home-corner-${position}`}
          key={position}
          viewBox="0 0 48 48"
          fill="none"
        >
          <path
            d="M2 44V2h42M6 30V6h24M10 19c8 0 9-9 15-9m-15 15c9-2 13-6 15-15M8 37c15-2 27-14 29-29"
            stroke="currentColor"
          />
          <path
            d="m12 7 2 4 4 1-4 2-2 4-1-4-4-2 4-1 1-4Zm14 4 2 3 4 1-4 2-2 3-1-3-4-2 4-1 1-3Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </span>
  );
}

export default function Home({ data, settings, BookCard, AudioList }) {
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
    );
  const saved = readLocal("quran-bookmark", null);
  const bookmark =
    saved &&
    Number.isInteger(saved.chapter) &&
    saved.chapter >= 1 &&
    saved.chapter <= 114 &&
    Number.isInteger(saved.verse) &&
    saved.verse >= 1 &&
    saved.verse <= 286
      ? saved
      : null;
  const featured = data.books.filter((book) => book.featured).slice(0, 3);
  const pickedAudio = data.audio.filter((audio) => audio.featured);
  const audio = (
    pickedAudio.length
      ? pickedAudio
      : [...data.audio].sort((a, b) => b.id - a.id)
  ).slice(0, 3);
  const entries = [
    {
      to: "/alquran",
      icon: "book",
      title: "Baca Al-Qur’an",
      text: "Surah & terjemahan",
    },
    {
      to: "/kitab",
      icon: "library",
      title: "Buka Kitab",
      text: "Koleksi bacaan majelis",
    },
    {
      to: "/murotal",
      icon: "audio",
      title: "Dengarkan Murotal",
      text: "Lantunan untuk hati",
    },
  ];

  return (
    <div className="home-page">
      <section
        className="home-welcome"
        style={{ "--home-art": `url("${welcomeArt}")` }}
      >
        <HomeCorners />
        <div className="home-welcome-copy">
          <span className="home-eyebrow">RUANG BACA DIGITAL MAJELIS</span>
          <h1>
            {settings.welcome ||
              "Assalamu’alaikum. Selamat datang di ruang baca kita."}
          </h1>
          <p>
            {settings.description ||
              "Temani waktu ibadah dengan Al-Qur’an, kitab sholawat, dan lantunan yang menenangkan."}
          </p>
        </div>
      </section>
      <nav className="home-entry-grid" aria-label="Jelajahi ruang baca">
        {entries.map((entry) => (
          <Link className="home-entry" key={entry.to} to={entry.to}>
            <HomeCorners />
            <span className="home-entry-icon">
              <HomeIcon name={entry.icon} />
            </span>
            <span className="home-entry-text">
              <b>{entry.title}</b>
              <small>{entry.text}</small>
            </span>
            <span className="home-entry-arrow">
              <HomeIcon name="arrow" />
            </span>
          </Link>
        ))}
      </nav>
      {bookmark && (
        <Link
          className="home-quran-resume"
          aria-label={`Lanjutkan bacaan Al-Qur’an: ${bookmark.name || `Surah ${bookmark.chapter}`}, ayat ${bookmark.verse}`}
          to={`/alquran/${bookmark.chapter}?page=${Math.ceil(bookmark.verse / 50)}#ayat-${bookmark.verse}`}
        >
          <HomeCorners />
          <span className="home-resume-medal">
            <HomeIcon name="bookmark" />
          </span>
          <span className="home-resume-copy">
            <small>Lanjutkan bacaan</small>
            <b>
              {bookmark.name || `Surah ${bookmark.chapter}`}
              <span> · Ayat {bookmark.verse}</span>
            </b>
            <span>Penanda bacaan Anda</span>
          </span>
          <span className="home-resume-button">
            Lanjutkan <HomeIcon name="arrow" />
          </span>
        </Link>
      )}
      <div className="home-collections">
        <section
          className="home-panel home-books"
          aria-labelledby="home-books-title"
        >
          <HomeCorners />
          <header className="home-panel-heading">
            <h2 id="home-books-title">Kitab pilihan</h2>
            <Link to="/kitab">
              Lihat semua <HomeIcon name="arrow" />
            </Link>
          </header>
          {featured.length ? (
            <div className="home-book-grid">
              {featured.map((book) => (
                <BookCard key={book.id} book={book} compact />
              ))}
            </div>
          ) : (
            <div className="home-empty">
              <HomeIcon name="library" />
              <h3>Koleksi pilihan segera hadir</h3>
              <p>
                Kitab pilihan akan ditampilkan setelah diatur oleh pengurus.
              </p>
              <Link className="button" to="/kitab">
                Jelajahi kitab <HomeIcon name="arrow" />
              </Link>
            </div>
          )}
        </section>
        <section
          className="home-panel home-audio"
          aria-labelledby="home-audio-title"
        >
          <HomeCorners />
          <header className="home-panel-heading">
            <h2 id="home-audio-title">Lantunan pilihan</h2>
            <Link to="/murotal">
              Lihat semua <HomeIcon name="arrow" />
            </Link>
          </header>
          {audio.length ? (
            <AudioList items={audio} compact />
          ) : (
            <div className="home-empty">
              <HomeIcon name="audio" />
              <h3>Lantunan segera hadir</h3>
              <p>
                Belum ada audio. Pengurus dapat menambahkan rekaman untuk
                didengarkan bersama.
              </p>
            </div>
          )}
          <div className="home-audio-note">
            <span aria-hidden="true">✧</span>
            <p>
              Luangkan waktu sejenak,
              <br />
              dengarkan lantunan yang menenangkan.
            </p>
          </div>
        </section>
      </div>
      {continued.length > 0 && (
        <section
          className="home-continued"
          aria-labelledby="home-continued-title"
        >
          <header className="home-panel-heading">
            <h2 id="home-continued-title">Lanjutkan membaca kitab</h2>
          </header>
          <div className="home-continue-grid">
            {continued.slice(0, 4).map((book) => (
              <Link key={book.id} to={`/kitab/${book.id}`}>
                <span className="home-continue-icon">
                  <HomeIcon name="book" />
                </span>
                <span>
                  <b>{book.title}</b>
                  <small>Halaman {progress[book.id].page}</small>
                </span>
                <HomeIcon name="arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
      {data.bc.length > 0 && (
        <section
          className="home-categories"
          aria-labelledby="home-category-title"
        >
          <header className="home-panel-heading">
            <h2 id="home-category-title">Jelajahi kategori</h2>
          </header>
          <div>
            {data.bc.map((category) => (
              <Link key={category.id} to={`/kitab?kategori=${category.id}`}>
                <HomeIcon name="library" />
                {category.name}
                <HomeIcon name="arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
      <footer className="home-footer">
        <HomeIcon name="book" />
        <span>
          {settings.name || "Kitab Majelis"} <span>· Ruang baca digital</span>
        </span>
        <span aria-hidden="true">✧</span>
      </footer>
    </div>
  );
}
