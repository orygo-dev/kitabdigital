import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("alur admin, pembaca, audio persisten, merek, layar pembuka dan offline", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Galat browser:", e.message);
  });
  await page.goto("/admin");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const cache = await caches.open(
          names.find((name) => name.startsWith("kitab-shell-")),
        );
        return (await cache.keys()).filter((request) =>
          request.url.includes("/assets/"),
        ).length;
      }),
    )
    .toBeGreaterThanOrEqual(3);
  await page.getByLabel("Nama pengguna", { exact: true }).fill("penguji");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("KataSandiPengujian123!");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kelola majelis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kitab", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Tambah kitab", exact: true })
    .click();
  await page.getByLabel("Judul", { exact: true }).fill("Kitab Verifikasi");
  await page
    .getByLabel("Berkas PDF")
    .setInputFiles("test-results/fixtures/kitab.pdf");
  await expect(page.getByText("Berkas tersedia:")).toBeVisible();
  await page
    .getByLabel("Gambar sampul")
    .setInputFiles("test-results/fixtures/sampul.png");
  await expect(page.getByAltText("Gambar sampul")).toBeVisible();
  await page.getByLabel("Terbitkan untuk umum").check();
  await page.getByLabel("Tampilkan di beranda").check();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan berhasil disimpan.")).toBeVisible();
  await page.getByRole("link", { name: "▤ Kitab" }).click();
  await expect(
    page.getByRole("heading", { name: "Kitab Verifikasi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Simpan offline" }).click();
  await expect(page.getByText("Tersimpan offline")).toBeVisible();
  await page.getByRole("link", { name: "Baca kitab" }).click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 1 dari 12");
  await expect(page.locator(".stf__parent")).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 3 dari 12");
  await page
    .getByRole("button", { name: "☆ Tandai halaman", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 3 dari 12");
  await expect(
    page.getByRole("button", { name: "★ Hapus penanda" }),
  ).toBeVisible();
  await page.getByLabel("Mode", { exact: true }).selectOption("standard");
  await expect(page.locator(".standard-page canvas")).toBeVisible();
  await page.evaluate(() => {
    const original = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (selector) {
      if (selector === ".pdf-page" && this.classList.contains("flip-host")) {
        Element.prototype.querySelectorAll = original;
        throw Error("Simulasi kegagalan animasi");
      }
      return original.call(this, selector);
    };
  });
  await page.getByLabel("Mode", { exact: true }).selectOption("flip");
  await expect(page.getByLabel("Mode", { exact: true })).toHaveValue(
    "standard",
  );
  await expect(
    page.getByText("Animasi tidak tersedia. Mode standar telah diaktifkan."),
  ).toBeVisible();
  await page.getByLabel("Nomor halaman").fill("7");
  await page.getByRole("button", { name: "Ke halaman", exact: true }).click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 7 dari 12");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Kitab", exact: true }).click();
  await page.getByRole("button", { name: "Ubah", exact: true }).click();
  await page.getByLabel("Arah baca").selectOption("ltr");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan berhasil disimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Tambah audio", exact: true })
    .click();
  await page.getByLabel("Judul", { exact: true }).fill("Audio Verifikasi");
  await page
    .getByLabel("Berkas MP3")
    .setInputFiles("test-results/fixtures/nada.mp3");
  await expect(page.getByText("Berkas tersedia:")).toBeVisible();
  await page.getByLabel("Terbitkan untuk umum").check();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan berhasil disimpan.")).toBeVisible();
  await page.getByRole("link", { name: "♫ Murotal" }).click();
  await page.getByRole("button", { name: "Putar", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  const before = await page.locator("audio").evaluate((a) => a.currentTime);
  await page.getByRole("link", { name: "▤ Kitab" }).click();
  await page.getByRole("link", { name: "Baca kitab" }).click();
  await expect(page.getByText("Bacaan kiri ke kanan")).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(before);
  await expect(page.locator(".reader-status")).toHaveText("Halaman 7 dari 12");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Tampilan & beranda" }).click();
  await page
    .getByLabel("Nama aplikasi", { exact: true })
    .fill("Majelis Verifikasi");
  await page
    .getByLabel("Logo aplikasi", { exact: true })
    .setInputFiles("test-results/fixtures/sampul.png");
  await expect(page.getByAltText("Logo aplikasi")).toBeVisible();
  await page.getByLabel("Aktifkan layar pembuka").check();
  await page
    .getByLabel("Teks pembuka", { exact: true })
    .fill("Selamat datang jamaah");
  await page.getByLabel("Durasi (detik)").fill("2");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.locator(".brand")).toContainText("Majelis Verifikasi");
  await page.goto("/");
  await expect(page.locator(".splash")).toContainText("Selamat datang jamaah");
  await expect(page.locator(".splash")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "▤ Kitab" }).click();
  await page.getByRole("link", { name: "Baca kitab" }).click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 7 dari 12");
  await expect(page.locator(".stf__parent")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 7 dari 12");
  await expect
    .poll(() =>
      page
        .locator(".brand img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator(".splash")).toBeHidden();
  await context.setOffline(false);
  await page.screenshot({
    path: "test-results/pembaca-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("regresi: seluruh halaman desktop/mobile, filter, audio, pengaturan dan salinan offline", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await page.request.post("/api/auth/login", {
    data: { username: "penguji", password: "KataSandiPengujian123!" },
  });
  const headers = { "x-csrf-token": (await login.json()).csrf };
  async function post(kind, data) {
    const res = await page.request.post("/api/admin/" + kind, {
      headers,
      data,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
  }
  async function put(kind, id, data) {
    const res = await page.request.put(
      "/api/admin/" + kind + (id ? "/" + id : ""),
      { headers, data },
    );
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
  }
  async function upload(kind, file, mime) {
    const res = await page.request.post("/api/admin/uploads/" + kind, {
      headers,
      multipart: {
        file: {
          name: file,
          mimeType: mime,
          buffer: await readFile("test-results/fixtures/" + file),
        },
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).file;
  }
  await put("settings", null, { splash_enabled: false });
  const pdf12 = await upload("books", "kitab.pdf", "application/pdf"),
    pdf13 = await upload("books", "kitab-13.pdf", "application/pdf");
  const bc = await post("book-categories", { name: "Kategori audit kitab" });
  const ac = await post("audio-categories", { name: "Kategori audit audio" });
  const books = [];
  for (const direction of ["rtl", "ltr"])
    for (const count of [12, 13])
      books.push(
        await post("books", {
          title: `Audit ${direction} ${count}`,
          file: count === 12 ? pdf12 : pdf13,
          direction,
          category_id: bc.id,
          published: true,
          downloadable: true,
        }),
      );
  const visiblePages = () =>
    page.locator(".pdf-page").evaluateAll((elements) =>
      elements
        .filter(
          (el) =>
            getComputedStyle(el).display !== "none" &&
            el.dataset.page !== "null",
        )
        .map((el) => Number(el.dataset.page))
        .sort((a, b) => a - b),
    );
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (const book of books) {
    const count = book.title.endsWith("13") ? 13 : 12;
    await page.goto("/kitab/" + book.id);
    for (let p = 1; p <= count; p += 2) {
      await expect(page.locator(".reader-status")).toHaveText(
        `Halaman ${p} dari ${count}`,
      );
      await expect.poll(visiblePages).toEqual(p < count ? [p, p + 1] : [p]);
      expect(
        await page.locator(".pdf-page canvas").count(),
      ).toBeLessThanOrEqual(8);
      if (p + 2 <= count)
        await page
          .getByRole("button", { name: "Berikutnya", exact: true })
          .click();
    }
    await expect(
      page.getByRole("button", { name: "Berikutnya", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
    await expect(page.locator(".reader-status")).toHaveText(
      `Halaman ${count === 12 ? 9 : 11} dari ${count}`,
    );
    await page.getByLabel("Mode", { exact: true }).selectOption("standard");
    await page.getByLabel("Nomor halaman").fill("2");
    await page.getByRole("button", { name: "Ke halaman", exact: true }).click();
    await expect(page.locator(".reader-status")).toHaveText(
      `Halaman 2 dari ${count}`,
    );
    await page.getByLabel("Mode", { exact: true }).selectOption("flip");
    await expect(page.locator(".reader-status")).toHaveText(
      `Halaman 2 dari ${count}`,
    );
    await expect.poll(visiblePages).toEqual([1, 2]);
    await expect(
      page.getByRole("button", { name: "Sebelumnya", exact: true }),
    ).toBeDisabled();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const book of books.filter((b) => b.title.endsWith("13"))) {
    await page.goto("/kitab/" + book.id);
    await page.getByLabel("Nomor halaman").fill("1");
    await page.getByRole("button", { name: "Ke halaman", exact: true }).click();
    for (let p = 1; p <= 13; p++) {
      await expect(page.locator(".reader-status")).toHaveText(
        `Halaman ${p} dari 13`,
      );
      await expect.poll(visiblePages).toEqual([p]);
      if (p < 13)
        await page
          .getByRole("button", { name: "Berikutnya", exact: true })
          .click();
    }
  }
  const target = books.find((book) => book.title === "Audit rtl 13");
  await page.evaluate((id) => {
    const progress = JSON.parse(
      localStorage.getItem("reading-progress") || "{}",
    );
    progress[id] = { page: 4, updated: Date.now() };
    localStorage.setItem("reading-progress", JSON.stringify(progress));
    history.pushState(null, "", "/kitab/" + id);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, target.id);
  await expect(page.locator(".reader-status")).toHaveText("Halaman 4 dari 13");
  const mp3 = await upload("audio", "nada.mp3", "audio/mpeg");
  const a1 = await post("audio", {
    title: "Audit audio pertama",
    file: mp3,
    published: true,
    category_id: ac.id,
  });
  await post("audio", {
    title: "Audit audio kedua",
    file: mp3,
    published: true,
    category_id: ac.id,
  });
  const playlist = await post("playlists", {
    name: "Audit satu audio",
    audio_ids: [a1.id],
  });
  await page.goto("/kitab?kategori=" + bc.id);
  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue(
    String(bc.id),
  );
  await page.getByLabel("Cari judul").fill("Audit rtl");
  await page.getByRole("link", { name: "♫ Murotal" }).click();
  await expect(page.getByLabel("Cari judul")).toHaveValue("");
  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Audit audio pertama" }),
  ).toBeVisible();
  await page
    .getByLabel("Daftar putar", { exact: true })
    .selectOption(String(playlist.id));
  await page
    .locator(".audio-row")
    .filter({ hasText: "Audit audio pertama" })
    .getByRole("button", { name: "Putar", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 15;
  });
  await page
    .getByRole("button", { name: "Audio berikutnya", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime < 5),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Jeda", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.paused))
    .toBe(true);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Tampilan & beranda" }).click();
  await page
    .getByLabel("Nama aplikasi", { exact: true })
    .fill("Nama tersimpan audit");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan berhasil disimpan.")).toBeVisible();
  await expect(page.getByLabel("Nama aplikasi", { exact: true })).toHaveValue(
    "Nama tersimpan audit",
  );
  await page.route(
    "**/api/admin/books",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Kitab", exact: true }).click();
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await expect(page.locator(".admin-list")).toContainText(
    "Audit audio pertama",
  );
  await page.waitForTimeout(800);
  await expect(page.locator(".admin-list")).not.toContainText("Audit rtl 12");
  const saved = books.find((b) => b.title === "Audit ltr 12");
  await page.goto("/kitab");
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, "persist", {
      value: () => Promise.reject(Error("Ditolak")),
      configurable: true,
    });
  });
  const card = page.locator(".book-card").filter({
    has: page.getByRole("heading", { name: saved.title, exact: true }),
  });
  await card.getByRole("button", { name: "Simpan offline" }).click();
  await expect(card.getByText("Tersimpan offline")).toBeVisible();
  await put("books", saved.id, {
    file: pdf13,
    title: "Kitab versi baru audit",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kitab versi baru audit" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.goto("/kitab/" + saved.id);
  await expect(page.locator(".reader-status")).toContainText("dari 12");
  await expect(
    page.getByRole("heading", { name: saved.title, exact: true }),
  ).toBeVisible();
  await page.evaluate(() => caches.delete("kitab-downloads-v1"));
  await page.getByRole("link", { name: "← Kembali ke kitab" }).click();
  const evicted = page.locator(".book-card").filter({
    has: page.getByRole("heading", { name: saved.title, exact: true }),
  });
  await expect(evicted.getByText("Tersimpan offline")).toBeHidden();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("sentuhan: ketuk tepi dan geser RTL/LTR pada halaman tunggal", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const login = await page.request.post("/api/auth/login", {
    data: { username: "penguji", password: "KataSandiPengujian123!" },
  });
  const headers = { "x-csrf-token": (await login.json()).csrf };
  await page.request.put("/api/admin/settings", {
    headers,
    data: { splash_enabled: false },
  });
  const upload = await page.request.post("/api/admin/uploads/books", {
    headers,
    multipart: {
      file: {
        name: "sentuhan.pdf",
        mimeType: "application/pdf",
        buffer: await readFile("test-results/fixtures/kitab.pdf"),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const file = (await upload.json()).file;
  await page.setViewportSize({ width: 390, height: 844 });
  for (const direction of ["rtl", "ltr"]) {
    const response = await page.request.post("/api/admin/books", {
      headers,
      data: {
        title: "Audit sentuhan " + direction,
        direction,
        file,
        published: true,
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto("/kitab/" + (await response.json()).id);
    await expect(page.locator(".reader-status")).toHaveText(
      "Halaman 1 dari 12",
    );
    const active = page.locator('.pdf-page[data-page="1"]');
    const box = await active.boundingBox();
    await page.mouse.click(
      direction === "rtl" ? box.x + 8 : box.x + box.width - 8,
      box.y + box.height / 2,
    );
    await expect(page.locator(".reader-status")).toHaveText(
      "Halaman 2 dari 12",
    );
    await page.locator('.pdf-page[data-page="2"]').evaluate((el, direction) => {
      const box = el.getBoundingClientRect(),
        y = box.y + box.height / 2;
      const from = box.x + box.width * (direction === "rtl" ? 0.2 : 0.8),
        to = box.x + box.width * (direction === "rtl" ? 0.8 : 0.2);
      const touch = (x) =>
        new Touch({
          identifier: 1,
          target: el,
          clientX: x,
          clientY: y,
          pageX: x + scrollX,
          pageY: y + scrollY,
        });
      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [touch(from)],
          changedTouches: [touch(from)],
        }),
      );
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          changedTouches: [touch(to)],
        }),
      );
    }, direction);
    await expect(page.locator(".reader-status")).toHaveText(
      "Halaman 3 dari 12",
    );
  }
  expect(errors).toEqual([]);
});
