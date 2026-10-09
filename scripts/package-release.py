#!/usr/bin/env python3
"""Package the built workspace without local data or installed dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
if not (root / 'dist/index.html').is_file():
    raise SystemExit('Run npm run build first.')
output = root / 'releases/BERETS-Plot-Ubuntu-Windows.zip'
output.parent.mkdir(exist_ok=True)
folders = ['bin', 'server', 'src', 'dist', 'public']
files = ['package.json', 'package-lock.json', 'README.md', 'LICENSE',
         'THIRD-PARTY-NOTICES.md', 'START-LINUX.sh', 'START-WINDOWS.cmd']
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, 'BERETS-Plot/' + name)
    for name in folders:
        for path in sorted((root / name).rglob('*')):
            if path.is_file():
                archive.write(path, 'BERETS-Plot/' + path.relative_to(root).as_posix())
print(output)
