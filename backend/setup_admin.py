import getpass
import argparse
from argon2 import PasswordHasher
from sqlalchemy import select
from backend.models import Session, AdminUser


def main(skip_existing=False):
    with Session() as db:
        if db.scalar(select(AdminUser)):
            if skip_existing:
                print("Administrator yang sudah ada dipertahankan.")
                return
            raise SystemExit(
                "Administrator sudah tersedia. Penyiapan awal hanya dapat dijalankan sekali."
            )
        username = input("Nama pengguna administrator: ").strip()
        password = getpass.getpass("Kata sandi (12–512 karakter): ")
        if not 1 <= len(username) <= 100 or not 12 <= len(password) <= 512:
            raise SystemExit(
                "Nama pengguna harus 1–100 karakter dan kata sandi 12–512 karakter."
            )
        if password != getpass.getpass("Ulangi kata sandi: "):
            raise SystemExit("Kata sandi tidak cocok.")
        db.add(
            AdminUser(username=username, password_hash=PasswordHasher().hash(password))
        )
        db.commit()
        print("Administrator berhasil dibuat.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Penyiapan administrator Kitab Digital."
    )
    parser.add_argument(
        "--if-missing",
        action="store_true",
        help="Pertahankan akun yang sudah tersedia tanpa meminta kredensial baru.",
    )
    main(skip_existing=parser.parse_args().if_missing)
