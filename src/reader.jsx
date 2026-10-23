import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PageFlip } from "page-flip";
import { fileUrl, readLocal, saveLocal } from "./api";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export default function Reader(props) {
  const { id } = useParams();
  return <BookReader key={id} id={id} {...props} />;
}
function BookReader({ books, loading, id }) {
  const book =
    (!navigator.onLine && readLocal("offline-books", {})[id]) ||
    books.find((b) => b.id === Number(id)) ||
    readLocal("offline-books", {})[id];
  const [pdf, setPdf] = useState(null),
    [page, setPage] = useState(
      readLocal("reading-progress", {})[id]?.page || 1,
    ),
    [mode, setMode] = useState("flip"),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [marks, setMarks] = useState(readLocal("bookmarks", {})[id] || []),
    [twoPages, setTwoPages] = useState(false),
    [size, setSize] = useState(0);
  const stage = useRef(),
    shell = useRef(),
    flip = useRef(),
    cache = useRef(new Map()),
    generation = useRef(0),
    tasks = useRef([]),
    pageRef = useRef(page);
  pageRef.current = page;
  function disposeFlip() {
    const instance = flip.current;
    flip.current = null;
    // A failed initialization may leave StPageFlip without its internal UI.
    try {
      instance?.destroy();
    } catch {
      /* Continue with the standard reader. */
    }
  }
  useEffect(() => {
    setPdf(null);
    setError("");
    setBusy(true);
    cache.current.clear();
    setMarks(readLocal("bookmarks", {})[id] || []);
    if (!book) return;
    const task = pdfjs.getDocument(fileUrl(book.file));
    let cancelled = false;
    task.promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        const saved = Number(readLocal("reading-progress", {})[id]?.page);
        setPage(
          Number.isInteger(saved)
            ? Math.min(Math.max(saved, 1), doc.numPages)
            : 1,
        );
        const stored = readLocal("bookmarks", {})[id];
        const valid = Array.isArray(stored)
          ? stored.filter(
              (n) => Number.isInteger(n) && n >= 1 && n <= doc.numPages,
            )
          : [];
        setMarks(valid);
        saveLocal("bookmarks", { ...readLocal("bookmarks", {}), [id]: valid });
        setBusy(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Kitab gagal dibuka. Periksa koneksi atau simpan kitab untuk dibaca offline.",
          );
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [book?.file, id]);
  useEffect(() => {
    const onResize = () => setSize((s) => s + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!pdf) return;
    saveLocal("reading-progress", {
      ...readLocal("reading-progress", {}),
      [id]: { page, updated: Date.now() },
    });
  }, [page, pdf, id]);
  useEffect(() => {
    if (!pdf || !stage.current) return;
    const gen = ++generation.current;
    let alive = true;
    setBusy(true);
    async function render() {
      try {
        disposeFlip();
        stage.current.replaceChildren();
        const width = Math.max(
          200,
          Math.min(shell.current.clientWidth - 32, 1200),
        );
        const spread = width >= 760;
        setTwoPages(spread);
        const anchor = spread ? page - (page % 2 === 0 ? 1 : 0) : page;
        const pageWidth = Math.min(spread ? width / 2 : width, 570);
        const sample = await pdf.getPage(page),
          vp = sample.getViewport({ scale: 1 });
        const pageHeight = (pageWidth * vp.height) / vp.width;
        // Only a bounded window is mounted and rendered, even for very large books.
        const start = Math.max(1, anchor - (spread ? 2 : 3)),
          end = Math.min(pdf.numPages, anchor + (spread ? 5 : 4)),
          logical = Array.from(
            { length: end - start + 1 },
            (_, i) => start + i,
          );
        if (spread && logical.length % 2) logical.push(null);
        const order =
          book.direction === "rtl" ? [...logical].reverse() : logical;
        const host = document.createElement("div");
        host.className = "flip-host";
        stage.current.append(host);
        for (const n of mode === "flip" ? order : [page]) {
          if (!alive || gen !== generation.current) return;
          const el = document.createElement("div");
          el.className = "pdf-page";
          el.dataset.page = n;
          el.style.width = pageWidth + "px";
          el.style.height = pageHeight + "px";
          const canvas = document.createElement("canvas");
          el.append(canvas);
          host.append(el);
          if (n === null) {
            el.setAttribute("aria-hidden", "true");
            continue;
          }
          const dpr = Math.min(window.devicePixelRatio || 1, 2),
            key = `${n}-${Math.round(pageWidth)}-${zoom}-${dpr}`;
          let cached = cache.current.get(key);
          if (!cached) {
            const p = await pdf.getPage(n),
              base = p.getViewport({ scale: 1 }),
              v = p.getViewport({
                scale: Math.min(
                  (pageWidth / base.width) * dpr * zoom,
                  Math.sqrt(4000000 / (base.width * base.height)),
                ),
              });
            const temp = document.createElement("canvas");
            temp.width = Math.floor(v.width);
            temp.height = Math.floor(v.height);
            const task = p.render({
              canvasContext: temp.getContext("2d"),
              viewport: v,
            });
            tasks.current.push(task);
            await task.promise;
            tasks.current = tasks.current.filter((t) => t !== task);
            cached = temp;
            cache.current.set(key, temp);
            while (
              cache.current.size > 12 ||
              [...cache.current.values()].reduce(
                (sum, c) => sum + c.width * c.height,
                0,
              ) > 24000000
            )
              cache.current.delete(cache.current.keys().next().value);
          }
          if (!alive || gen !== generation.current) return;
          canvas.width = cached.width;
          canvas.height = cached.height;
          canvas.getContext("2d").drawImage(cached, 0, 0);
          canvas.style.width = pageWidth * zoom + "px";
          canvas.style.height = pageHeight * zoom + "px";
        }
        if (!alive || gen !== generation.current) return;
        if (mode === "flip") {
          const instance = new PageFlip(host, {
            width: pageWidth,
            height: pageHeight,
            size: "fixed",
            showCover: false,
            usePortrait: !spread,
            autoSize: true,
            mobileScrollSupport: false,
            flippingTime: 550,
            startPage: order.indexOf(page),
            drawShadow: true,
            maxShadowOpacity: 0.2,
          });
          flip.current = instance;
          instance.loadFromHTML(host.querySelectorAll(".pdf-page"));
          instance.on("flip", (e) => {
            const visible = spread
              ? order.slice(e.data, e.data + 2).filter(Number.isInteger)
              : [order[e.data]];
            const next = Math.min(...visible);
            if (
              Number.isInteger(next) &&
              next >= 1 &&
              next <= pdf.numPages &&
              next !== pageRef.current
            )
              setPage(next);
          });
        } else {
          host.className = "standard-page";
          host.style.width = pageWidth + "px";
        }
        setBusy(false);
      } catch (e) {
        if (!alive) return;
        if (e?.name === "RenderingCancelledException") return;
        setBusy(false);
        if (mode === "flip") {
          setMode("standard");
          setError("Animasi tidak tersedia. Mode standar telah diaktifkan.");
        } else setError("Halaman gagal dirender. Coba halaman lain.");
      }
    }
    render();
    return () => {
      alive = false;
      for (const t of tasks.current) t.cancel();
      tasks.current = [];
      disposeFlip();
    };
  }, [pdf, page, mode, zoom, size, book?.direction]);
  function go(delta) {
    const spread = twoPages && mode === "flip";
    const anchor = spread ? page - (page % 2 === 0 ? 1 : 0) : page;
    const n = anchor + delta * (spread ? 2 : 1);
    if (n < 1 || n > pdf.numPages) return;
    if (mode === "flip" && flip.current) {
      try {
        book.direction === "rtl"
          ? delta > 0
            ? flip.current.flipPrev()
            : flip.current.flipNext()
          : delta > 0
            ? flip.current.flipNext()
            : flip.current.flipPrev();
        return;
      } catch {
        setMode("standard");
      }
    }
    setPage(n);
  }
  function bookmark() {
    const value = marks.includes(page)
      ? marks.filter((n) => n !== page)
      : [...marks, page].sort((a, b) => a - b);
    setMarks(value);
    saveLocal("bookmarks", { ...readLocal("bookmarks", {}), [id]: value });
  }
  if (!book)
    return (
      <p>
        {loading ? "Memuat kitab…" : "Kitab tidak ditemukan."}{" "}
        <Link to="/kitab">Kembali ke koleksi</Link>
      </p>
    );
  return (
    <section className="reader" ref={shell}>
      <Link to="/kitab">← Kembali ke kitab</Link>
      <div className="section-heading">
        <div>
          <small>
            {book.direction === "rtl"
              ? "Bacaan kanan ke kiri"
              : "Bacaan kiri ke kanan"}
          </small>
          <h1>{book.title}</h1>
        </div>
        <button
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await shell.current.requestFullscreen();
            } catch {
              setError("Layar penuh tidak didukung peramban ini.");
            }
          }}
        >
          Layar penuh
        </button>
      </div>
      <div className="reader-tools">
        <label>
          Mode{" "}
          <select
            aria-label="Mode"
            value={mode}
            onChange={(e) => {
              setZoom(1);
              setMode(e.target.value);
            }}
          >
            <option value="flip">Animasi buku</option>
            <option value="standard">Standar</option>
          </select>
        </label>
        <button
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
          aria-label="Perkecil"
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => {
            setMode("standard");
            setZoom((z) => Math.min(3, z + 0.25));
          }}
          aria-label="Perbesar"
        >
          +
        </button>
        <button disabled={!pdf || busy} onClick={bookmark}>
          {marks.includes(page) ? "★ Hapus penanda" : "☆ Tandai halaman"}
        </button>
        <select
          aria-label="Halaman bertanda"
          value=""
          onChange={(e) => setPage(Number(e.target.value))}
        >
          <option value="">Penanda ({marks.length})</option>
          {marks.map((n) => (
            <option key={n} value={n}>
              Halaman {n}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="reader-status" aria-live="polite">
        {busy
          ? "Memuat halaman…"
          : pdf
            ? `Halaman ${page} dari ${pdf.numPages}`
            : ""}
      </div>
      <div className="reader-stage" ref={stage} />
      {pdf && (
        <div className="page-controls">
          <button
            disabled={page <= (twoPages && mode === "flip" ? 2 : 1) || busy}
            onClick={() => go(-1)}
          >
            Sebelumnya
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(new FormData(e.target).get("page"));
              if (n >= 1 && n <= pdf.numPages) setPage(n);
            }}
          >
            <label>
              Halaman{" "}
              <input
                name="page"
                aria-label="Nomor halaman"
                type="number"
                min="1"
                max={pdf.numPages}
                key={page}
                defaultValue={page}
              />
            </label>
            <span> / {pdf.numPages}</span>
            <button>Ke halaman</button>
          </form>
          <button
            disabled={
              page >=
                pdf.numPages -
                  (twoPages && mode === "flip" && pdf.numPages % 2 === 0
                    ? 1
                    : 0) || busy
            }
            onClick={() => go(1)}
          >
            Berikutnya
          </button>
        </div>
      )}
      <p className="hint">
        Geser atau ketuk tepi halaman untuk membalik. Gunakan mode standar saat
        memperbesar halaman.
      </p>
    </section>
  );
}
