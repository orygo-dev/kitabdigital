import getpass
from argon2 import PasswordHasher
from sqlalchemy import select
from backend.models import Session, AdminUser


def main():
    with Session() as db:
        if db.scalar(select(AdminUser)):
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
    main()
