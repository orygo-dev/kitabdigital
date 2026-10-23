"""Uji installer menggunakan file sementara dan perintah Apache/sistem tiruan."""

import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from unittest.mock import patch

import pytest

from deploy.aapanel import configure, insert_include, proxy_config, valid_domain

ROOT = Path(__file__).resolve().parents[1]
VHOST = """# Konfigurasi dan sertifikat bawaan panel harus tetap tersedia.
<VirtualHost *:80>
    ServerName kitab.contoh.id
    DocumentRoot /www/wwwroot/kitab.contoh.id
</VirtualHost>
<VirtualHost *:443>
    ServerName kitab.contoh.id
    ServerAlias www.kitab.contoh.id
    SSLEngine on
    SSLCertificateFile /www/server/panel/vhost/cert/kitab.contoh.id/fullchain.pem
    SSLCertificateKeyFile /www/server/panel/vhost/cert/kitab.contoh.id/privkey.pem
</VirtualHost>
"""


@pytest.mark.parametrize(
    "domain", ["kitab.contoh.id", "www.majelis-sholawat.id", "a.b"]
)
def test_domain_valid(domain):
    assert valid_domain(domain)


@pytest.mark.parametrize(
    "domain",
    [
        "https://kitab.id",
        "../etc/passwd",
        "kitab.id/abc",
        "kitab.id:443",
        "kitab..id",
        "-kitab.id",
        "kitab_.id",
        "kitab.id\nInclude /tmp/x",
        "x" * 64 + ".id",
    ],
)
def test_domain_invalid(domain):
    assert not valid_domain(domain)
    with pytest.raises(ValueError):
        insert_include(VHOST, domain, "/etc/kitab/apache-proxy.conf")


def test_only_https_changes_and_repeated_run_is_identical():
    updated = insert_include(VHOST, "kitab.contoh.id", "/etc/kitab/apache-proxy.conf")
    before_http = VHOST.split("</VirtualHost>", 1)[0]
    assert updated.split("</VirtualHost>", 1)[0] == before_http
    assert updated.count('IncludeOptional "/etc/kitab/apache-proxy.conf"') == 1
    assert (
        "SSLCertificateFile /www/server/panel/vhost/cert/kitab.contoh.id/fullchain.pem"
        in updated
    )
    assert (
        insert_include(updated, "kitab.contoh.id", "/etc/kitab/apache-proxy.conf")
        == updated
    )
    assert "/.well-known/" in proxy_config()
    assert "127.0.0.1:8000/" in proxy_config()
    assert 'X-Forwarded-Proto "https"' in proxy_config()


def test_no_ssl_wrong_domain_and_existing_proxy_are_rejected():
    for source in [
        VHOST.split("<VirtualHost *:443>")[0],
        VHOST.replace("kitab.contoh.id", "lain.contoh.id"),
        VHOST.replace(
            "    SSLEngine on",
            "    ProxyPass / http://127.0.0.1:9999/\n    SSLEngine on",
        ),
        VHOST + VHOST,
    ]:
        with pytest.raises(ValueError):
            insert_include(source, "kitab.contoh.id", "/etc/kitab/apache-proxy.conf")


@pytest.mark.parametrize("port", [8000, 8001, 8100])
def test_config_is_backed_up_validated_and_reloaded(tmp_path, port):
    vhost = tmp_path / "website.conf"
    vhost.write_text(VHOST)
    snippet = tmp_path / "proxy.conf"
    calls = []

    def run(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0)

    with patch("deploy.aapanel.subprocess.run", side_effect=run):
        backup = configure(
            vhost, snippet, "kitab.contoh.id", "apachectl", tmp_path / "backups", port
        )
    assert backup.read_text() == VHOST
    assert "IncludeOptional" in vhost.read_text()
    assert snippet.read_text() == proxy_config(port)
    assert calls == [
        ["apachectl", "-t"],
        ["apachectl", "-t"],
        ["apachectl", "-k", "graceful"],
    ]


@pytest.mark.parametrize("failure_at", [2, 3])
@pytest.mark.parametrize("existing_snippet", [False, True])
def test_invalid_config_or_reload_restores_original_files(
    tmp_path, failure_at, existing_snippet
):
    vhost = tmp_path / "website.conf"
    vhost.write_text(VHOST)
    snippet = tmp_path / "proxy.conf"
    if existing_snippet:
        snippet.write_text("# konfigurasi sebelumnya\n")
    count = 0

    def run(command, **kwargs):
        nonlocal count
        count += 1
        if count == failure_at:
            raise subprocess.CalledProcessError(1, command)
        return subprocess.CompletedProcess(command, 0)

    with patch("deploy.aapanel.subprocess.run", side_effect=run):
        with pytest.raises(subprocess.CalledProcessError):
            configure(
                vhost, snippet, "kitab.contoh.id", "apachectl", tmp_path / "backups"
            )
    assert vhost.read_text() == VHOST
    if existing_snippet:
        assert snippet.read_text() == "# konfigurasi sebelumnya\n"
    else:
        assert not snippet.exists()


def bash_executable():
    if os.name == "nt":
        candidate = (
            Path(os.environ.get("ProgramFiles", "C:/Program Files"))
            / "Git/bin/bash.exe"
        )
        if candidate.is_file():
            return str(candidate)
    executable = shutil.which("bash")
    if not executable:
        pytest.skip("Bash tidak tersedia.")
    return executable


def bash_run(script):
    return subprocess.run(
        [
            bash_executable(),
            "-c",
            f'source "{(ROOT / "install.sh").as_posix()}"\n' + script,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def test_bash_syntax_and_help():
    syntax = subprocess.run(
        [bash_executable(), "-n", str(ROOT / "install.sh")],
        capture_output=True,
        text=True,
    )
    assert syntax.returncode == 0, syntax.stderr
    result = subprocess.run(
        [bash_executable(), str(ROOT / "install.sh"), "--help"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert "--check" in result.stdout


def test_bash_domain_validation_matches_python():
    for domain in [
        "kitab.contoh.id",
        "a.b",
        "https://kitab.id",
        "kitab..id",
        "a" * 64 + ".id",
        "-kitab.id",
        "kitab.id:443",
    ]:
        # Pass values as positional arguments rather than interpolating shell input.
        result = subprocess.run(
            [
                bash_executable(),
                "-c",
                f'source "{(ROOT / "install.sh").as_posix()}"; valid_domain "$1"',
                "test",
                domain,
            ],
            capture_output=True,
        )
        assert (result.returncode == 0) == valid_domain(domain)


@pytest.mark.parametrize(
    "distribution,version,accepted",
    [
        ("ubuntu", "20.04", True),
        ("ubuntu", "22.04", True),
        ("ubuntu", "24.04", True),
        ("ubuntu", "18.04", False),
        ("debian", "12", True),
        ("debian", "11", False),
        ("rocky", "9.4", True),
        ("rocky", "8.10", False),
        ("unknown", "24", False),
    ],
)
def test_distribution_compatibility(distribution, version, accepted):
    result = bash_run(f'check_distribution "{distribution}" "{version}"')
    assert (result.returncode == 0) == accepted, result.stderr


@pytest.mark.parametrize(
    "mode,expected", [("free", 8000), ("busy", 8001), ("full", None), ("error", None)]
)
def test_port_selection_skips_occupied_ports_and_fails_closed(mode, expected):
    result = bash_run(
        "ss(){ "
        + {
            "free": ":;",
            "busy": '[[ "$*" != *":8000 )" ]] || echo occupied;',
            "full": "echo occupied;",
            "error": "return 2;",
        }[mode]
        + ' }; select_port; echo "SELECTED=$APP_PORT"'
    )
    if expected is None:
        assert result.returncode != 0
        assert "SELECTED=" not in result.stdout
    else:
        assert result.returncode == 0, result.stderr
        assert f"SELECTED={expected}" in result.stdout


def test_check_mode_performs_no_installation():
    result = bash_run("""check_host(){ :; }
ask_domain(){ :; }
check_apache(){ :; }
prerequisites(){ echo TIDAK_BOLEH_DIPASANG; exit 44; }
main --check --domain kitab.contoh.id
""")
    assert result.returncode == 0, result.stderr
    assert "Tidak ada konfigurasi yang diubah" in result.stdout
    assert "TIDAK_BOLEH_DIPASANG" not in result.stdout


@pytest.mark.parametrize("fail_build", [False, True])
def test_installation_order_and_failure_stops_later_steps(fail_build):
    result = bash_run(
        """check_host(){ :; }
ask_domain(){ :; }
check_apache(){ :; }
check_root(){ :; }
check_terminal(){ :; }
systemctl(){ return 1; }
ss(){ :; }
select_port(){ :; }
prerequisites(){ echo kebutuhan; }
get_project(){ echo proyek; }
install_python(){ echo python; }
build_frontend(){ echo build; """
        + ("return 9;" if fail_build else ":;")
        + """ }
configure_service(){ echo admin-layanan; }
configure_apache(){ echo apache; }
finish(){ echo selesai; }
main --domain kitab.contoh.id
"""
    )
    if fail_build:
        assert result.returncode != 0
        assert "admin-layanan" not in result.stdout
        assert "database, dan unggahan tidak dihapus" in result.stderr
    else:
        assert result.returncode == 0, result.stderr
        assert result.stdout.splitlines() == [
            "kebutuhan",
            "proyek",
            "python",
            "build",
            "admin-layanan",
            "apache",
            "selesai",
        ]


def test_admin_setup_if_missing_keeps_existing_account(tmp_path):
    with sqlite3.connect(tmp_path / "app.db") as db:
        db.execute(
            "CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL, session_token_hash TEXT NOT NULL)"
        )
        db.execute(
            "INSERT INTO admin_users VALUES (1,'admin-lama','hash-lama','sesi-lama')"
        )
    env = os.environ.copy()
    env["DATA_DIR"] = str(tmp_path)
    env.pop("DATABASE_URL", None)
    result = subprocess.run(
        [sys.executable, "-m", "backend.setup_admin", "--if-missing"],
        cwd=ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "dipertahankan" in result.stdout
    with sqlite3.connect(tmp_path / "app.db") as db:
        assert db.execute(
            "SELECT username,password_hash,session_token_hash FROM admin_users"
        ).fetchall() == [("admin-lama", "hash-lama", "sesi-lama")]
