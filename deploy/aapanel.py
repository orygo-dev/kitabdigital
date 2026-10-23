"""Konfigurasi Apache aaPanel dengan backup, pemeriksaan sintaks, dan rollback."""

import argparse
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone


def valid_domain(value):
    return (
        isinstance(value, str)
        and len(value) <= 253
        and "." in value
        and all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in value.split(".")
        )
    )


def proxy_config(port=8000):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Port tidak valid.")
    return f"""# Dikelola installer Kitab Digital. Hanya untuk VirtualHost HTTPS.
ProxyRequests Off
ProxyPreserveHost On
ProxyAddHeaders Off
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Forwarded-For "expr=%{{REMOTE_ADDR}}"
ProxyTimeout 300
LimitRequestBody 214958080
ProxyPass "/.well-known/" "!"
ProxyPass "/" "http://127.0.0.1:{port}/" connectiontimeout=5 timeout=300
ProxyPassReverse "/" "http://127.0.0.1:{port}/"
"""


def insert_include(content, domain, include_file):
    if not valid_domain(domain):
        raise ValueError(
            "Domain tidak valid. Masukkan nama domain tanpa https:// atau path."
        )
    include_file = str(include_file).replace("\\", "/")
    if (
        not (
            PurePosixPath(include_file).is_absolute()
            or PureWindowsPath(include_file).is_absolute()
        )
        or any(char in include_file for char in '\r\n"\x00')
        or ".." in PurePosixPath(include_file).parts
    ):
        raise ValueError("Lokasi konfigurasi tidak valid.")
    directive = f'IncludeOptional "{include_file}"'
    found = 0
    pattern = re.compile(
        r"(^[ \t]*<VirtualHost\s+([^>]+)>)(.*?)(^[ \t]*</VirtualHost\s*>)",
        re.M | re.S | re.I,
    )

    def replace(match):
        nonlocal found
        addresses = match[2].split()
        if not any(address.endswith(":443") for address in addresses):
            return match[0]
        names = []
        for line in match[3].splitlines():
            value = re.match(r"\s*Server(?:Name|Alias)\s+(.+)", line, re.I)
            if value:
                names.extend(
                    name.strip("\"'").lower()
                    for name in value[1].split()
                    if not name.startswith("#")
                )
        if domain not in names:
            return match[0]
        found += 1
        body = match[3]
        active_lines = [
            line.strip()
            for line in body.splitlines()
            if not line.lstrip().startswith("#")
        ]
        if directive in active_lines:
            return match[0]
        if re.search(r'^\s*ProxyPass\s+["\']?/["\']?\s', body, re.M | re.I):
            raise ValueError(
                "Website sudah memiliki reverse proxy /. Nonaktifkan proxy lama pada website ini lalu ulangi installer."
            )
        return match[1] + body.rstrip() + "\n    " + directive + "\n" + match[4]

    result = pattern.sub(replace, content)
    if found != 1:
        raise ValueError(
            "Harus ada satu VirtualHost HTTPS untuk domain ini. Buat website dan aktifkan SSL di aaPanel terlebih dahulu."
        )
    return result


def atomic_write(path, content, mode=0o644):
    path = Path(path)
    previous = path.stat() if path.exists() else None
    descriptor, temporary = tempfile.mkstemp(prefix=".kitab-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as output:
            output.write(content)
        os.chmod(temporary, previous.st_mode & 0o777 if previous else mode)
        if previous and hasattr(os, "chown"):
            os.chown(temporary, previous.st_uid, previous.st_gid)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def configure(vhost, include_file, domain, apachectl, backups):
    vhost, include_file, backups = map(Path, (vhost, include_file, backups))
    original = vhost.read_text(encoding="utf-8")
    updated = insert_include(original, domain, include_file)
    snippet = proxy_config()
    previous_snippet = (
        include_file.read_text(encoding="utf-8") if include_file.exists() else None
    )
    # Do not change a server whose current configuration already fails validation.
    subprocess.run([str(apachectl), "-t"], check=True)
    backups.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup = backups / f"{domain}-{stamp}.conf.bak"
    shutil.copy2(vhost, backup)
    if include_file.exists():
        shutil.copy2(include_file, backups / f"proxy-{stamp}.conf.bak")
    include_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        atomic_write(include_file, snippet)
        atomic_write(vhost, updated)
        subprocess.run([str(apachectl), "-t"], check=True)
        subprocess.run([str(apachectl), "-k", "graceful"], check=True)
    except Exception:
        atomic_write(vhost, original)
        if previous_snippet is None:
            include_file.unlink(missing_ok=True)
        else:
            atomic_write(include_file, previous_snippet)
        # Reload the restored configuration if the failed reload touched the server.
        subprocess.run([str(apachectl), "-t"], check=False)
        subprocess.run([str(apachectl), "-k", "graceful"], check=False)
        raise
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--vhost", required=True)
    parser.add_argument("--apachectl", required=True)
    parser.add_argument("--include", default="/etc/kitab/apache-proxy.conf")
    parser.add_argument("--backups", default="/var/backups/kitab")
    args = parser.parse_args()
    try:
        backup = configure(
            args.vhost, args.include, args.domain, args.apachectl, args.backups
        )
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"Konfigurasi Apache gagal; perubahan dipulihkan: {exc}")
    print(f"Reverse proxy Apache siap. Backup: {backup}")


if __name__ == "__main__":
    main()
