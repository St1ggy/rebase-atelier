"""Install the pinned upstream Jujutsu binary for GitHub-hosted runners."""

import io
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

VERSION = "0.45.1"
TARGETS = {
    ("darwin", "arm64"): "aarch64-apple-darwin",
    ("darwin", "x86_64"): "x86_64-apple-darwin",
    ("linux", "x86_64"): "x86_64-unknown-linux-musl",
    ("win32", "amd64"): "x86_64-pc-windows-msvc",
}
target = TARGETS[(sys.platform, platform.machine().lower())]
windows = sys.platform == "win32"
extension = "zip" if windows else "tar.gz"
filename = "jj.exe" if windows else "jj"
url = f"https://github.com/jj-vcs/jj/releases/download/v{VERSION}/jj-v{VERSION}-{target}.{extension}"
directory = pathlib.Path(os.environ["RUNNER_TEMP"]) / "rebase-atelier-tools"
directory.mkdir(parents=True, exist_ok=True)
destination = directory / filename

with urllib.request.urlopen(url, timeout=60) as response:
    archive_bytes = io.BytesIO(response.read())

if windows:
    with zipfile.ZipFile(archive_bytes) as archive:
        member = next(name for name in archive.namelist() if pathlib.PurePosixPath(name).name == filename)
        with archive.open(member) as source, destination.open("wb") as output:
            shutil.copyfileobj(source, output)
else:
    with tarfile.open(fileobj=archive_bytes, mode="r:gz") as archive:
        member = next(item for item in archive.getmembers() if item.isfile() and pathlib.PurePosixPath(item.name).name == filename)
        source = archive.extractfile(member)
        if source is None:
            raise RuntimeError("Missing Jujutsu executable in upstream archive")
        with source, destination.open("wb") as output:
            shutil.copyfileobj(source, output)
    destination.chmod(0o755)

subprocess.run([str(destination), "--version"], check=True)
if os.environ.get("GITHUB_PATH"):
    with pathlib.Path(os.environ["GITHUB_PATH"]).open("a", encoding="utf8") as output:
        output.write(f"{directory}\n")
