import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, readLocal, saveLocal } from "./api";
import "./murotal.css";

function Icon({ type = "play" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "pause" ? (
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      ) : type === "next" ? (
        <>
          <path d="m5 5 10 7-10 7Z" fill="currentColor" />
          <path d="M19 5v14" />
        </>
      ) : type === "previous" ? (
        <>
          <path d="m19 5-10 7 10 7Z" fill="currentColor" />
          <path d="M5 5v14" />
        </>
      ) : type === "repeat" ? (
        <>
          <path d="M4 10V7h15l-3-3M20 14v3H5l3 3M19 7l-3 3M5 17l3-3" />
        </>
      ) : type === "search" ? (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 6 6" />
        </>
      ) : (
        <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}
function Wave() {
  return (
    <svg className="murotal-wave" viewBox="0 0 240 45" aria-hidden="true">
      {Array.from({ length: 40 }, (_, i) => (
        <path
          key={i}
          d={`M${3 + i * 6} ${22 - (4 + ((i * 13) % 19))}v${2 * (4 + ((i * 13) % 19))}`}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
function clock(value) {
  return Number.isFinite(value)
    ? `${Math.floor(value / 60)
        .toString()
        .padStart(2, "0")}:${Math.floor(value % 60)
        .toString()
        .padStart(2, "0")}`
    : "00:00";
}
export default function Murotal({ player, majelis }) {
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") === "majelis" || params.has("kategori")
      ? "majelis"
      : "quran";
  const [reciters, setReciters] = useState([]),
    [chapters, setChapters] = useState([]);
  const [reciter, setReciter] = useState("");
  const [files, setFiles] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [search, setSearch] = useState("");
  useEffect(() => {
    if (tab !== "quran") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api("/quran/reciters", { signal: controller.signal }),
      api("/quran/chapters", { signal: controller.signal }),
    ])
      .then(([r, c]) => {
        if (controller.signal.aborted) return;
        setReciters(r.reciters);
        setChapters(c.chapters);
        const saved = readLocal("murotal-qari", "");
        setReciter((old) =>
          String(
            r.reciters.find((x) => String(x.id) === (old || saved))?.id ||
              r.reciters.find((x) => /mishar|mishary/i.test(x.name))?.id ||
              r.reciters[0]?.id ||
              "",
          ),
        );
        if (!r.reciters.length) setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [retry, tab]);
  useEffect(() => {
    if (!reciter || tab !== "quran") return;
    const controller = new AbortController();
    setFiles([]);
    setLoading(true);
    setError("");
    api(`/quran/reciters/${reciter}/audio`, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) {
          setFiles(r.audio_files);
          setLoading(false);
          saveLocal("murotal-qari", reciter);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [reciter, retry, tab]);
  const qari = reciters.find((x) => String(x.id) === reciter);
  const queue = chapters.flatMap((c) => {
    const audio = files.find((x) => x.chapter_id === c.id);
    return audio
      ? [
          {
            id: `qf-${reciter}-${c.id}`,
            title: c.name_simple,
            author: qari?.name,
            audio_url: audio.audio_url,
            chapter_id: c.id,
            source: "quran",
          },
        ]
      : [];
  });
  const visible = chapters.filter((c) =>
    `${c.id} ${c.name_simple} ${c.name_arabic}`
      .toLocaleLowerCase("id")
      .includes(search.trim().toLocaleLowerCase("id")),
  );
  const active = player.current;
  const playingQuran = active?.source === "quran";
  return (
    <section className="murotal-page">
      <header className="murotal-hero">
        <div>
          <span className="murotal-eyebrow">LANTUNAN UNTUK HATI</span>
          <h1>
            Murotal <span>Al-Qur’an</span>
          </h1>
          <p>Dengarkan ayat suci, tenangkan hati.</p>
          <Wave />
        </div>
      </header>
      <div className="murotal-tabs" role="tablist" aria-label="Sumber audio">
        <button
          role="tab"
          aria-selected={tab === "quran"}
          aria-controls="murotal-content"
          onClick={() => setParams({})}
        >
          ♫ <span>Murotal Al-Qur’an</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "majelis"}
          aria-controls="murotal-content"
          onClick={() => setParams({ tab: "majelis" })}
        >
          ♬ <span>Audio Majelis</span>
        </button>
      </div>
      <div
        id="murotal-content"
        role="tabpanel"
        aria-label={tab === "quran" ? "Murotal Al-Qur’an" : "Audio Majelis"}
      >
        {tab === "majelis" ? (
          <div className="murotal-majelis">{majelis}</div>
        ) : (
          <div className="murotal-layout">
            <div className="murotal-directory">
              <div className="murotal-filters">
                <label className="murotal-qari">
                  Qari
                  <select
                    aria-label="Qari"
                    value={reciter}
                    disabled={!reciters.length}
                    onChange={(e) => setReciter(e.target.value)}
                  >
                    {!reciters.length && <option value="">Pilih qari</option>}
                    {reciters.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                        {r.style ? ` · ${r.style}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="murotal-search">
                  <Icon type="search" />
                  <input
                    type="search"
                    aria-label="Cari surah"
                    placeholder="Cari surah…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="murotal-list-title">
                <h2>Daftar surah</h2>
                <span>{chapters.length} surah</span>
              </div>
              {error ? (
                <div className="murotal-message" role="alert">
                  <p>{error}</p>
                  <button onClick={() => setRetry((n) => n + 1)}>
                    Coba lagi
                  </button>
                </div>
              ) : loading ? (
                <p className="murotal-message" role="status">
                  Memuat murotal…
                </p>
              ) : !queue.length ? (
                <p className="murotal-message">
                  Audio belum tersedia untuk qari ini. Silakan pilih qari
                  lainnya.
                </p>
              ) : (
                <>
                  <div className="murotal-surahs">
                    {visible.map((c) => {
                      const index = queue.findIndex(
                        (x) => x.chapter_id === c.id,
                      );
                      const selected =
                        index >= 0 && active?.id === queue[index]?.id;
                      return (
                        <article
                          className={`murotal-surah ${selected ? "is-current" : ""}`}
                          key={c.id}
                        >
                          <span className="murotal-number">{c.id}</span>
                          <div>
                            <h3>{c.name_simple}</h3>
                            <small>
                              {c.verses_count} ayat
                              {index < 0 ? " · Audio belum tersedia" : ""}
                            </small>
                          </div>
                          {selected && player.playing && (
                            <span
                              className="murotal-equalizer"
                              aria-hidden="true"
                            >
                              <i />
                              <i />
                              <i />
                              <i />
                            </span>
                          )}
                          <button
                            className="murotal-play"
                            disabled={index < 0}
                            aria-label={`${selected && player.playing ? "Jeda" : "Putar"} ${c.name_simple}`}
                            onClick={() =>
                              selected
                                ? player.toggle()
                                : player.start(queue, index)
                            }
                          >
                            <Icon
                              type={
                                selected && player.playing ? "pause" : "play"
                              }
                            />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {!visible.length && (
                    <p className="murotal-message">
                      Surah tidak ditemukan. Coba nama atau nomor surah lainnya.
                    </p>
                  )}
                </>
              )}
            </div>
            <aside className="murotal-now" aria-label="Panel murotal">
              <div className="murotal-now-card">
                <span className="murotal-now-label">
                  {playingQuran
                    ? player.playing
                      ? "SEDANG DIPUTAR"
                      : "DIJEDA"
                    : "DENGARKAN AL-QUR’AN"}
                </span>
                <div className="murotal-rosette" aria-hidden="true">
                  <svg
                    viewBox="0 0 100 100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <rect x="18" y="18" width="64" height="64" rx="8" />
                    <rect
                      x="18"
                      y="18"
                      width="64"
                      height="64"
                      rx="8"
                      transform="rotate(45 50 50)"
                    />
                    <circle cx="50" cy="50" r="28" />
                    {Array.from({ length: 8 }, (_, i) => (
                      <ellipse
                        key={i}
                        cx="50"
                        cy="35"
                        rx="10"
                        ry="18"
                        transform={`rotate(${i * 45} 50 50)`}
                      />
                    ))}
                  </svg>
                </div>
                <h2>{playingQuran ? active.title : "Lantunan penuh makna"}</h2>
                <p>
                  {playingQuran
                    ? active.author
                    : "Pilih qari dan putar surah favorit Anda."}
                </p>
                <Wave />
                {playingQuran ? (
                  <>
                    <label className="murotal-progress">
                      <input
                        aria-label="Posisi murotal"
                        type="range"
                        min="0"
                        max={
                          Number.isFinite(player.duration) ? player.duration : 0
                        }
                        value={player.time}
                        onChange={(e) => player.seek(e.target.value)}
                        disabled={!player.duration}
                      />
                      <span>
                        <span>{clock(player.time)}</span>
                        <span>{clock(player.duration)}</span>
                      </span>
                    </label>
                    <div className="murotal-controls">
                      <button
                        aria-label="Ulangi surah"
                        aria-pressed={player.repeat}
                        onClick={() => player.setRepeat(!player.repeat)}
                      >
                        <Icon type="repeat" />
                      </button>
                      <button
                        aria-label="Surah sebelumnya"
                        onClick={() => player.step(-1)}
                      >
                        <Icon type="previous" />
                      </button>
                      <button
                        className="murotal-main-play"
                        aria-label={
                          player.playing ? "Jeda murotal" : "Putar murotal"
                        }
                        onClick={player.toggle}
                      >
                        <Icon type={player.playing ? "pause" : "play"} />
                      </button>
                      <button
                        aria-label="Surah berikutnya"
                        onClick={() => player.step(1)}
                      >
                        <Icon type="next" />
                      </button>
                    </div>
                    <label className="murotal-volume">
                      Volume
                      <input
                        aria-label="Volume murotal"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={player.volume}
                        onChange={(e) =>
                          player.setVolume(Number(e.target.value))
                        }
                      />
                    </label>
                    {player.error && <p role="alert">{player.error}</p>}
                  </>
                ) : (
                  <p className="murotal-now-hint">
                    Audio diputar secara streaming.
                  </p>
                )}
              </div>
              <p className="murotal-attribution">
                ♫ Audio dari{" "}
                <a
                  href="https://quran.foundation"
                  target="_blank"
                  rel="noreferrer"
                >
                  Quran.Foundation
                </a>
              </p>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
