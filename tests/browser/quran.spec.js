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
  await page.getByRole("button", { name: "★ Ditandai" }).click();
  await expect(
    page.getByRole("button", { name: "☆ Tandai ayat", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "☆ Tandai ayat", exact: true })
    .click();
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

test("Mushaf: navigasi surah jelas di atas dan bawah, serta kontrol ponsel", async ({
  page,
}) => {
  await mockQuran(page);
  await page.goto("/alquran/1");
  const top = page.getByRole("navigation", {
    name: "Navigasi surah di atas",
    exact: true,
  });
  const bottom = page.getByRole("navigation", {
    name: "Pindah ke surah lain",
    exact: true,
  });
  await expect(
    top.getByRole("button", { name: /Surah sebelumnya/ }),
  ).toBeDisabled();
  await top
    .getByRole("link", { name: "Surah berikutnya: Al-Baqarah", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Al-Baqarah", exact: true }),
  ).toBeVisible();
  await bottom
    .getByRole("link", { name: "Surah sebelumnya: Al-Fatihah", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Al-Fatihah", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const tools = page.getByRole("button", { name: /Pilih surah & ayat/ });
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await tools.click();
  await page.getByLabel("Pindah surah").selectOption("2");
  await expect(
    page.getByRole("heading", { name: "Al-Baqarah", exact: true }),
  ).toBeVisible();
  await tools.click();
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await top
    .getByRole("link", { name: "Surah sebelumnya: Al-Fatihah", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "☆ Tandai ayat", exact: true }),
  ).toBeVisible();
});

test("Mushaf: surah terakhir tidak menautkan ke surah 115", async ({
  page,
}) => {
  await mockQuran(page);
  await page.route("**/api/quran/chapters", (route) =>
    route.fulfill({
      json: {
        chapters: [
          {
            id: 113,
            name_simple: "Al-Falaq",
            name_arabic: "الفلق",
            verses_count: 5,
            revelation_place: "makkah",
          },
          {
            id: 114,
            name_simple: "An-Nas",
            name_arabic: "الناس",
            verses_count: 6,
            revelation_place: "makkah",
          },
        ],
      },
    }),
  );
  await page.goto("/alquran/114");
  const top = page.getByRole("navigation", {
    name: "Navigasi surah di atas",
    exact: true,
  });
  await expect(
    top.getByRole("button", { name: /Surah berikutnya/ }),
  ).toBeDisabled();
  await expect(page.locator('a[href="/alquran/115"]')).toHaveCount(0);
  await top
    .getByRole("link", { name: "Surah sebelumnya: Al-Falaq", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Al-Falaq", exact: true }),
  ).toBeVisible();
});
