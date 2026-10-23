import { test, expect } from "@playwright/test";

// These tests mock collection/file requests; the full workflow suite covers offline service workers.
test.use({ serviceWorkers: "block" });

const book = {
  id: 701,
  title: "Kitab Pilihan Beranda",
  author: "Pengurus",
  description: "Deskripsi pengujian",
  file: `books/${"a".repeat(32)}.pdf`,
  cover: "",
  category_id: 901,
  featured: true,
  downloadable: true,
  published: true,
  direction: "rtl",
  position: 0,
};
const track = {
  id: 801,
  title: "Audio Pilihan Beranda",
  author: "",
  file: `audio/${"b".repeat(32)}.mp3`,
  cover: "",
  category_id: null,
  featured: true,
  downloadable: true,
  published: true,
};

async function mockHome(page, empty = false) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      json: {
        name: "Majelis Pengujian",
        welcome: "Assalamu’alaikum dari pengurus",
        description: "Selamat datang di ruang baca majelis.",
        primary: "#06634f",
        secondary: "#c19b4b",
        splash_enabled: false,
        logo: "",
      },
    }),
  );
  const collections = {
    books: empty
      ? []
      : [
          book,
          { ...book, id: 702, title: "Kitab Bukan Pilihan", featured: false },
        ],
    audio: empty ? [] : [track],
    "book-categories": empty ? [] : [{ id: 901, name: "Bacaan Majelis" }],
    "audio-categories": [],
    playlists: [],
  };
  await page.route("**/api/public/*", (route) =>
    route.fulfill({
      json:
        collections[new URL(route.request().url()).pathname.split("/").pop()] ||
        [],
    }),
  );
  await page.route("**/api/files/books/*", (route) =>
    route.fulfill({
      path: "test-results/fixtures/kitab.pdf",
      contentType: "application/pdf",
    }),
  );
  await page.route("**/api/files/audio/*", (route) =>
    route.fulfill({
      path: "test-results/fixtures/nada.mp3",
      contentType: "audio/mpeg",
    }),
  );
  await page.route("**/api/quran/chapters", (route) =>
    route.fulfill({
      json: {
        chapters: [
          {
            id: 2,
            name_simple: "Al-Baqarah",
            name_arabic: "البقرة",
            verses_count: 286,
            revelation_place: "madinah",
          },
        ],
      },
    }),
  );
  await page.route("**/api/quran/chapters/2/verses?*", (route) =>
    route.fulfill({
      json: {
        verses: [
          {
            verse_key: "2:51",
            verse_number: 51,
            text_uthmani: "نص للاختبار",
            translation: "Teks pengujian antarmuka.",
          },
        ],
        pagination: { current_page: 2, total_pages: 6, next_page: 3 },
        translation: { name: "Sumber uji" },
      },
    }),
  );
}

test("Beranda: pengaturan pengurus, penanda Quran, kitab dan audio yang tetap berjalan", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockHome(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "quran-bookmark",
      JSON.stringify({ chapter: 2, verse: 51, name: "Al-Baqarah" }),
    );
    localStorage.setItem(
      "reading-progress",
      JSON.stringify({ 701: { page: 3, updated: Date.now() } }),
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Assalamu’alaikum dari pengurus",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".home-books .book-card")).toHaveCount(1);
  await expect(page.locator(".home-books")).not.toContainText(
    "Kitab Bukan Pilihan",
  );
  await page.locator('a.home-entry[href="/alquran"]').click();
  await expect(page).toHaveURL(/\/alquran$/);
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("link", { name: "⌂ Beranda", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: "Lanjutkan bacaan Al-Qur’an: Al-Baqarah, ayat 51",
      exact: true,
    })
    .click();
  await expect(page.locator("#ayat-51")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("link", { name: "⌂ Beranda", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Putar: Audio Pilihan Beranda", exact: true })
    .click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0.1);
  const before = await page
    .locator("audio")
    .evaluate((audio) => audio.currentTime);
  await page.locator('a.home-entry[href="/kitab"]').click();
  await expect(
    page.getByRole("heading", { name: "Perpustakaan Kitab", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(before);
  await page
    .getByRole("heading", { name: "Kitab Pilihan Beranda", exact: true })
    .getByRole("link")
    .click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 3 dari 12");
  expect(errors).toEqual([]);
});

test("Beranda: koleksi kosong dan penanda tidak valid tetap rapi di ponsel", async ({
  page,
}) => {
  await mockHome(page, true);
  await page.addInitScript(() =>
    localStorage.setItem(
      "quran-bookmark",
      JSON.stringify({ chapter: 999, verse: 1 }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Koleksi pilihan segera hadir",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lantunan segera hadir", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-quran-resume")).toHaveCount(0);
  await expect(page.locator(".home-entry")).toHaveCount(3);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator('a.home-entry[href="/murotal"]')).toBeVisible();
  }
  await page.locator('a.home-entry[href="/murotal"]').click();
  await expect(
    page.getByRole("heading", { name: "Murotal Al-Qur’an", exact: true }),
  ).toBeVisible();
});

test("Beranda: kartu dan panel penanda tidak meluber pada layar kecil", async ({
  page,
}) => {
  await mockHome(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "quran-bookmark",
      JSON.stringify({ chapter: 2, verse: 51, name: "Al-Baqarah" }),
    ),
  );
  await page.goto("/");
  await expect(page.locator(".home-book-card")).toBeVisible();
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".home-quran-resume").scrollIntoViewIfNeeded();
    await expect(page.locator(".home-quran-resume")).toBeVisible();
  }
});
