import { test, expect } from "@playwright/test";

// Requests use deterministic fixtures; the full workflow suite exercises service-worker offline reads.
test.use({ serviceWorkers: "block" });
const books = [
  {
    id: 501,
    title: "Kitab Sholawat Uji",
    author: "Penulis Pertama",
    description: "Bacaan untuk pengujian perpustakaan.",
    file: `books/${"a".repeat(32)}.pdf`,
    cover: "",
    category_id: 601,
    featured: true,
    downloadable: true,
    direction: "rtl",
  },
  {
    id: 502,
    title: "Kitab Wirid Uji",
    author: "Penulis Kedua",
    description: "Bacaan lainnya.",
    file: `books/${"b".repeat(32)}.pdf`,
    cover: "",
    category_id: 602,
    featured: false,
    downloadable: false,
    direction: "rtl",
  },
];
async function mockLibrary(page, empty = false) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      json: {
        name: "Majelis Pengujian",
        primary: "#06634f",
        secondary: "#c19b4b",
        splash_enabled: false,
        logo: "",
      },
    }),
  );
  const data = {
    books: empty ? [] : books,
    audio: [],
    "book-categories": empty
      ? []
      : [
          { id: 601, name: "Sholawat" },
          { id: 602, name: "Wirid" },
        ],
    "audio-categories": [],
    playlists: [],
  };
  await page.route("**/api/public/*", (route) =>
    route.fulfill({
      json:
        data[new URL(route.request().url()).pathname.split("/").pop()] || [],
    }),
  );
  await page.route("**/api/files/books/*", (route) =>
    route.fulfill({
      path: "test-results/fixtures/kitab.pdf",
      contentType: "application/pdf",
    }),
  );
}

test("Daftar kitab: kategori URL, pencarian penulis, reset dan lanjutkan membaca", async ({
  page,
}) => {
  await mockLibrary(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "reading-progress",
      JSON.stringify({ 501: { page: 3, updated: Date.now() } }),
    ),
  );
  await page.goto("/kitab?kategori=601");
  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue("601");
  await expect(page.locator(".library-book-grid .book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Semua kitab", exact: true }).click();
  await page.getByLabel("Cari judul").fill("Penulis Kedua");
  await expect(page.locator(".library-book-grid .book-card")).toContainText(
    "Kitab Wirid Uji",
  );
  await page.getByLabel("Cari judul").fill("tidak-ada");
  await expect(
    page.getByRole("heading", { name: "Kitab tidak ditemukan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tampilkan semua kitab", exact: true })
    .click();
  await expect(page.locator(".library-book-grid .book-card")).toHaveCount(2);
  await page.locator(".library-continue").click();
  await expect(page.locator(".reader-status")).toHaveText("Halaman 3 dari 12");
});

test("Daftar kitab: simpan offline, status tersimpan, dan izin unduhan", async ({
  page,
}) => {
  await mockLibrary(page);
  await page.goto("/kitab");
  const first = page
    .locator(".library-book-grid .book-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Kitab Sholawat Uji",
        exact: true,
      }),
    });
  const second = page
    .locator(".library-book-grid .book-card")
    .filter({
      has: page.getByRole("heading", { name: "Kitab Wirid Uji", exact: true }),
    });
  await expect(
    second.getByRole("button", { name: "Simpan offline", exact: true }),
  ).toHaveCount(0);
  await first
    .getByRole("button", { name: "Simpan offline", exact: true })
    .click();
  await expect(first.getByRole("status")).toHaveText("Tersimpan offline");
  await page.reload();
  await expect(first.getByRole("status")).toHaveText("Tersimpan offline");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await first
      .getByRole("link", { name: "Baca kitab", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      first.getByRole("link", { name: "Baca kitab", exact: true }),
    ).toBeVisible();
  }
});

test("Daftar kitab: koleksi kosong memiliki akses Al-Qur’an", async ({
  page,
}) => {
  await mockLibrary(page, true);
  await page.goto("/kitab");
  await expect(
    page.getByRole("heading", {
      name: "Koleksi kitab segera hadir",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page.getByRole("link", { name: "Baca Al-Qur’an", exact: true }).click();
  await expect(page).toHaveURL(/\/alquran$/);
});
