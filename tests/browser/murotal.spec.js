import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "block" });
async function mock(page) {
  await page.route("**/api/settings", (r) =>
    r.fulfill({
      json: {
        name: "Majelis Pengujian",
        splash_enabled: false,
        primary: "#06634f",
        secondary: "#c19b4b",
      },
    }),
  );
  await page.route("**/api/public/*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/quran/chapters", (r) =>
    r.fulfill({
      json: {
        chapters: [
          { id: 1, name_simple: "Al-Fatihah", verses_count: 7 },
          { id: 2, name_simple: "Al-Baqarah", verses_count: 286 },
          { id: 3, name_simple: "Ali Imran", verses_count: 200 },
        ],
      },
    }),
  );
  await page.route("**/api/quran/reciters", (r) =>
    r.fulfill({
      json: {
        reciters: [
          { id: 7, name: "Mishary Rashid Alafasy", style: "Murattal" },
          { id: 8, name: "Qari Kedua", style: "Murattal" },
        ],
      },
    }),
  );
  await page.route("**/api/quran/reciters/*/audio", (r) =>
    r.fulfill({
      json: {
        audio_files: [1, 2].map((id) => ({
          chapter_id: id,
          audio_url: `https://download.quranicaudio.com/test/${id}.mp3`,
        })),
      },
    }),
  );
  await page.route("https://download.quranicaudio.com/**", (r) =>
    r.fulfill({
      path: "test-results/fixtures/nada.mp3",
      contentType: "audio/mpeg",
    }),
  );
}
test("Murotal: qari, pencarian, putar, navigasi, volume dan pemutar persisten", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mock(page);
  await page.goto("/murotal");
  await expect(page.getByLabel("Qari", { exact: true })).toHaveValue("7");
  await expect(
    page.getByRole("button", { name: "Putar Ali Imran", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Cari surah", { exact: true }).fill("baqarah");
  await expect(page.locator(".murotal-surah")).toHaveCount(1);
  await page.getByLabel("Cari surah", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Putar Al-Fatihah", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Jeda Al-Fatihah", exact: true })
    .click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.paused))
    .toBe(true);
  await page
    .getByRole("button", { name: "Putar murotal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Surah berikutnya", exact: true })
    .click();
  await expect(page.locator(".player-title b")).toHaveText("Al-Baqarah");
  await page
    .getByRole("button", { name: "Surah sebelumnya", exact: true })
    .click();
  await expect(page.locator(".player-title b")).toHaveText("Al-Fatihah");
  await page.getByLabel("Volume murotal").focus();
  await page.getByLabel("Volume murotal").press("Home");
  await page.getByLabel("Volume murotal").press("ArrowRight");
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.volume))
    .toBe(0.01);
  await page.getByRole("button", { name: "Ulangi surah", exact: true }).click();
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 10;
    a.dispatchEvent(new Event("ended"));
  });
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeLessThan(5);
  await page.getByRole("button", { name: "Ulangi surah", exact: true }).click();
  await page
    .locator("audio")
    .evaluate((a) => a.dispatchEvent(new Event("ended")));
  await expect(page.locator(".player-title b")).toHaveText("Al-Baqarah");
  await page.getByRole("link", { name: "▤ Kitab", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  await page.getByRole("link", { name: "♫ Murotal", exact: true }).click();
  await page.getByLabel("Qari", { exact: true }).selectOption("8");
  await page
    .getByRole("button", { name: "Putar Al-Fatihah", exact: true })
    .click();
  await expect(page.locator(".player-title small")).toHaveText("Qari Kedua");
  await page.reload();
  await expect(page.getByLabel("Qari", { exact: true })).toHaveValue("8");
  expect(errors).toEqual([]);
});
test("Murotal: gagal, coba lagi, koleksi kosong dan layar ponsel", async ({
  page,
}) => {
  await mock(page);
  let failed = true;
  await page.route("**/api/quran/reciters/*/audio", (r) =>
    r.fulfill(
      failed
        ? {
            status: 503,
            json: { detail: "Layanan murotal sedang tidak tersedia." },
          }
        : { json: { audio_files: [] } },
    ),
  );
  await page.goto("/murotal");
  await expect(page.getByRole("alert")).toContainText(
    "Layanan murotal sedang tidak tersedia.",
  );
  failed = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(
    page.getByText("Audio belum tersedia untuk qari ini.", { exact: false }),
  ).toBeVisible();
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("tab", { name: "Audio Majelis" }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Audio Majelis" }).click();
  await expect(page.getByText("Belum ada koleksi yang sesuai.")).toBeVisible();
  await expect(page).toHaveURL(/tab=majelis/);
});

test("Murotal: pulih setelah CDN gagal, satu rekaman, dan berganti ke Audio Majelis", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/api/quran/reciters/*/audio", (r) =>
    r.fulfill({
      json: {
        audio_files: [
          {
            chapter_id: 1,
            audio_url: "https://download.quranicaudio.com/test/1.mp3",
          },
        ],
      },
    }),
  );
  let broken = true;
  await page.route("https://download.quranicaudio.com/**", (r) =>
    broken
      ? r.abort()
      : r.fulfill({
          path: "test-results/fixtures/nada.mp3",
          contentType: "audio/mpeg",
        }),
  );
  await page.route("**/api/public/audio", (r) =>
    r.fulfill({
      json: [
        {
          id: 900,
          title: "Lantunan Majelis",
          author: "Majelis",
          file: "audio/test.mp3",
        },
      ],
    }),
  );
  await page.route("**/api/files/audio/*", (r) =>
    r.fulfill({
      path: "test-results/fixtures/nada.mp3",
      contentType: "audio/mpeg",
    }),
  );
  await page.goto("/murotal");
  await page
    .getByRole("button", { name: "Putar Al-Fatihah", exact: true })
    .click();
  await expect(page.locator(".player").getByRole("alert")).toBeVisible();
  broken = false;
  await page
    .getByRole("button", { name: "Putar murotal", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.duration > 0),
    )
    .toBe(true);
  await expect(page.locator(".player").getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Surah berikutnya", exact: true })
    .click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeLessThan(5);
  await expect(page.getByLabel("Posisi murotal")).toHaveAttribute(
    "max",
    /2[0-9]/,
  );
  await page.getByLabel("Posisi murotal").focus();
  await page.getByLabel("Posisi murotal").press("ArrowRight");
  await page.getByRole("tab", { name: "Audio Majelis" }).click();
  await page
    .locator(".audio-row")
    .getByRole("button", { name: "Putar", exact: true })
    .click();
  await expect(page.locator(".player-title b")).toHaveText("Lantunan Majelis");
  await expect(page.locator("audio")).toHaveCount(1);
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
});
