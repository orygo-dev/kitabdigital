"""Pemeriksaan native Linux tanpa memasang layanan atau mengubah Apache sistem.

Jalankan: python3 -m unittest tests.linux_installer_smoke -v
Memakai Apache/systemd-analyze lokal jika tersedia; semua konfigurasi berada di temp.
"""

import getpass
import grp
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import time

from deploy.aapanel import configure

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(sys.platform.startswith("linux"), "Memerlukan Linux native.")
class NativeInstallerChecks(unittest.TestCase):
    @unittest.skipUnless(
        hasattr(os, "geteuid") and os.geteuid() == 0,
        "Pemeriksaan runuser memerlukan root pada mesin uji.",
    )
    def test_admin_password_prompt_under_runuser_stays_hidden(self):
        import fcntl
        import pty
        import select
        import termios

        if not shutil.which("runuser"):
            self.skipTest("runuser tidak tersedia.")
        master, slave = pty.openpty()

        def terminal_session():
            os.setsid()
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)

        code = "import getpass; input('Nama: '); password=getpass.getpass('Sandi: '); print('PANJANG='+str(len(password)))"
        process = subprocess.Popen(
            ["runuser", "-u", "nobody", "--", "python3", "-c", code],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            preexec_fn=terminal_session,
        )
        os.close(slave)
        output = b""
        username_sent = False
        password_sent = False
        password = b"UjiTersembunyi123!"
        try:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.2)[0]:
                    try:
                        chunk = os.read(master, 4096)
                    except OSError:
                        break
                    if not chunk:
                        break
                    output += chunk
                    if b"Nama:" in output and not username_sent:
                        os.write(master, b"penguji\n")
                        username_sent = True
                    if b"Sandi:" in output and not password_sent:
                        os.write(master, password + b"\n")
                        password_sent = True
                if process.poll() is not None:
                    break
            process.wait(timeout=5)
            self.assertEqual(process.returncode, 0, output.decode(errors="replace"))
            self.assertIn(b"PANJANG=" + str(len(password)).encode(), output)
            self.assertNotIn(password, output)
            self.assertNotIn(b"GetPassWarning", output)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            os.close(master)

    def test_bash_syntax(self):
        subprocess.run(["bash", "-n", str(ROOT / "install.sh")], check=True)

    def test_real_apache_accepts_generated_proxy(self):
        apache = shutil.which("apache2") or shutil.which("httpd")
        modules = Path("/usr/lib/apache2/modules")
        if not apache or not modules.is_dir():
            self.skipTest("Apache dengan modul Debian/Ubuntu tidak tersedia.")
        with tempfile.TemporaryDirectory(prefix="kitab-native-") as directory:
            root = Path(directory)
            vhost = root / "website.conf"
            vhost.write_text(
                f'<VirtualHost *:443>\n ServerName kitab.contoh.id\n DocumentRoot "{root}"\n</VirtualHost>\n'
            )
            config = root / "httpd.conf"
            loads = "\n".join(
                f'LoadModule {module}_module "{modules}/mod_{module}.so"'
                for module in [
                    "mpm_event",
                    "authz_core",
                    "proxy",
                    "proxy_http",
                    "headers",
                ]
            )
            config.write_text(
                f'ServerRoot "{root}"\nServerName localhost\nPidFile "{root}/apache.pid"\nErrorLog "{root}/error.log"\n{loads}\nInclude "{vhost}"\n'
            )
            control = root / "apachectl"
            # The -t action executes real Apache. Reload never touches the host service.
            control.write_text(
                f'#!/bin/sh\nif [ "$1" = -t ]; then exec "{apache}" -t -f "{config}"; fi\n[ "$1" = -k ] && [ "$2" = graceful ]\n'
            )
            control.chmod(0o755)
            backup = configure(
                vhost, root / "proxy.conf", "kitab.contoh.id", control, root / "backups"
            )
            self.assertTrue(backup.is_file())
            self.assertIn("IncludeOptional", vhost.read_text())

    def test_real_systemd_accepts_service_template(self):
        analyzer = shutil.which("systemd-analyze")
        if not analyzer:
            self.skipTest("systemd-analyze tidak tersedia.")
        with tempfile.TemporaryDirectory(prefix="kitab-native-") as directory:
            root = Path(directory)
            app = root / "app"
            (app / ".venv/bin").mkdir(parents=True)
            (app / ".venv/bin/uvicorn").symlink_to(shutil.which("true"))
            data = root / "data"
            data.mkdir()
            environment = root / "kitab.env"
            environment.write_text(f"DATA_DIR={data}\nCOOKIE_SECURE=true\n")
            source = (ROOT / "install.sh").read_text()
            template = source.split('cat > "$SERVICE_FILE" <<SERVICE\n', 1)[1].split(
                "\nSERVICE\n", 1
            )[0]
            for key, value in {
                "APP_DIR": app,
                "DATA_DIR": data,
                "ENV_FILE": environment,
            }.items():
                template = template.replace("$" + key, str(value))
            template = template.replace(
                "User=kitab", "User=" + getpass.getuser()
            ).replace("Group=kitab", "Group=" + grp.getgrgid(os.getgid()).gr_name)
            service = root / "kitab-native.service"
            service.write_text(template + "\n")
            result = subprocess.run(
                [analyzer, "verify", "--man=no", str(service)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
