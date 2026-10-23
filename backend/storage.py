"""Batas penyimpanan berkas. Ganti adapter ini untuk integrasi R2 di masa depan."""

from pathlib import Path
from typing import Protocol
from .models import DATA


class Storage(Protocol):
    def path(self, key: str) -> Path: ...
    def exists(self, key: str) -> bool: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        target = (self.root / key).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError("Alamat berkas tidak valid.")
        return target

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()


storage = LocalStorage(DATA / "uploads")
