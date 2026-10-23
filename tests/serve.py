import os, tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="kitab-browser-test-")
os.environ.pop("DATABASE_URL", None)
from argon2 import PasswordHasher
from backend.models import Session, AdminUser
from tests.fixtures import fixtures
from pathlib import Path

with Session() as db:
    db.add(
        AdminUser(
            username="penguji",
            password_hash=PasswordHasher().hash("KataSandiPengujian123!"),
        )
    )
    db.commit()
fixture_dir = Path("test-results/fixtures")
fixture_dir.mkdir(parents=True, exist_ok=True)
for name, content in zip(["kitab.pdf", "sampul.png", "nada.mp3"], fixtures()):
    (fixture_dir / name).write_bytes(content)
from pypdf import PdfReader, PdfWriter

writer = PdfWriter()
writer.append(PdfReader(fixture_dir / "kitab.pdf"))
writer.add_blank_page(width=700, height=400)
writer.write(fixture_dir / "kitab-13.pdf")
import uvicorn

uvicorn.run("backend.main:app", host="127.0.0.1", port=8001)
