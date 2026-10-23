import { test, expect } from "@playwright/test";

async function mockQuran(page) {
  await page.route("**/api/quran/chapters", (route) =>
    route.fulfill({
      json: {
        chapters: [
          {
            id: 1,
            name_simple: "Al-Fatihah",
            name_arabic: "الفاتحة",
            verses_count: 7,
            revelation_place: "makkah",
          },
          {
            id: 2,
            name_simple: "Al-Baqarah",
            name_arabic: "البقرة",
            verses_count: 286,
            revelation_place: "madinah",
          },
        ],
        source: "Quran.Foundation",
      },
    }),
  );
  await page.route("**/api/quran/chapters/*/verses?*", (route) => {
    const url = new URL(route.request().url());
    const chapter = Number(url.pathname.split("/")[4]);
    const current = Number(url.searchParams.get("page"));
    const verse = current === 2 ? 51 : 1;
    return route.fulfill({
      json: {
        verses: [
          {
            verse_key: `${chapter}:${verse}`,
            verse_number: verse,
            text_uthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
            translation: "Terjemahan uji antarmuka.",
          },
        ],
        pagination: {
          current_page: current,
          total_pages: chapter === 2 ? 6 : 1,
          next_page: chapter === 2 && current === 1 ? 2 : null,
        },
        translation: { id: 33, name: "Sumber uji", author_name: "Pengujian" },
        source: "Quran.Foundation",
      },
    });
  });
}

test("Al-Qur’an: urutan menu, surah, terjemahan, penanda dan layar kecil", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockQuran(page);
  await page.goto("/alquran");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  await expect(nav.getByRole("link")).toHaveText([
    "⌂ Beranda",
    "۞ Al-Qur’an",
    "▤ Kitab",
    "♫ Murotal",
  ]);
  await page.getByRole("button", { name: "Madaniyah", exact: true }).click();
  await expect(page.locator(".quran-chapter")).toHaveCount(1);
  await expect(page.locator(".quran-chapter")).toContainText("Al-Baqarah");
  await page.getByRole("button", { name: "Makkiyah", exact: true }).click();
  await expect(page.locator(".quran-chapter")).toContainText("Al-Fatihah");
  await page.getByRole("button", { name: "Semua surah", exact: true }).click();
  await page.getByLabel("Cari surah").fill("baqarah");
  await expect(page.locator(".quran-chapter")).toHaveCount(1);
  await page.locator(".quran-chapter").click();
  await expect(page.locator(".quran-arabic")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".quran-translation")).toHaveText(
    "Terjemahan uji antarmuka.",
  );
  await page.getByLabel("Terjemahan Indonesia").uncheck();
  await expect(page.locator(".quran-translation")).toHaveCount(0);
  await page.getByLabel("Ukuran teks Arab").focus();
  await page.getByLabel("Ukuran teks Arab").press("End");
  await expect(page.locator(".quran-arabic")).toHaveCSS("font-size", "48px");
  await page.getByRole("link", { name: "Berikutnya", exact: true }).click();
  await expect(page.locator("#ayat-51")).toBeVisible();
  await page.getByLabel("Lompat ke ayat").fill("1");
  await page.getByRole("button", { name: "Buka ayat", exact: true }).click();
  await expect(page.locator("#ayat-1")).toBeVisible();
  await page.getByLabel("Lompat ke ayat").fill("51");
  await page.getByRole("button", { name: "Buka ayat", exact: true }).click();
  await expect(page.locator("#ayat-51")).toBeVisible();
  await page
    .getByRole("button", { name: "☆ Tandai ayat", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "★ Ditandai" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "★ Ditandai" })).toBeVisible();
  await page.getByRole("link", { name: "Daftar surah", exact: true }).click();
  await page.getByRole("link", { name: /Lanjutkan bacaan:/ }).click();
  await expect(page).toHaveURL(/alquran\/2\?page=2#ayat-51/);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("#ayat-51")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Al-Qur’an: belum diaktifkan, coba lagi, dan cache saat sumber gagal", async ({
  page,
}) => {
  await page.route("**/api/quran/chapters", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Layanan Al-Qur’an belum diaktifkan oleh pengurus." },
    }),
  );
  await page.goto("/alquran");
  await expect(
    page.getByRole("alert").filter({ hasText: "belum diaktifkan" }),
  ).toBeVisible();
  await page.unroute("**/api/quran/chapters");
  await mockQuran(page);
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.locator(".quran-chapter").first().click();
  await expect(page.locator(".quran-arabic")).toBeVisible();
  await page.unroute("**/api/quran/chapters");
  await page.unroute("**/api/quran/chapters/*/verses?*");
  await page.route("**/api/quran/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByText(/Menampilkan salinan bacaan/)).toBeVisible();
  await expect(page.locator(".quran-arabic")).toBeVisible();
});

test("Al-Qur’an: nomor surah tidak valid", async ({ page }) => {
  await page.goto("/alquran/115");
  await expect(
    page.getByRole("alert").filter({ hasText: "Surah tidak ditemukan." }),
  ).toBeVisible();
});
