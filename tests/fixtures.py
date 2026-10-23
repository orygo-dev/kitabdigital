"""Berkas valid buatan pengujian; tidak dimasukkan ke koleksi aplikasi."""

from io import BytesIO
from PIL import Image, ImageDraw
import lameenc
import math, struct


def fixtures():
    pages = []
    for i in range(1, 13):
        img = Image.new("RGB", (500, 700), "#fffdf0")
        draw = ImageDraw.Draw(img)
        draw.rectangle((20, 20, 480, 680), outline="#06634f", width=4)
        draw.text((60, 60), f"KITAB UJI - HALAMAN {i}", fill="#06634f", font_size=24)
        draw.text(
            (60, 120),
            "Dokumen untuk verifikasi pembaca PDF.",
            fill="black",
            font_size=16,
        )
        pages.append(img)
    pdf = BytesIO()
    pages[0].save(pdf, format="PDF", save_all=True, append_images=pages[1:])
    cover = BytesIO()
    pages[0].save(cover, format="PNG")
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(22050)
    encoder.set_channels(1)
    encoder.set_quality(5)
    pcm = b"".join(
        struct.pack("<h", int(1800 * math.sin(2 * math.pi * 220 * i / 22050)))
        for i in range(22050 * 25)
    )
    mp3 = encoder.encode(pcm) + encoder.flush()
    return pdf.getvalue(), cover.getvalue(), bytes(mp3)
