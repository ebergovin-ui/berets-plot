#!/usr/bin/env python3
"""Verify the portable ZIP starts with production dependencies only."""
import json, os, socket, subprocess, tempfile, time, urllib.request
from pathlib import Path
from zipfile import ZipFile
root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='berets-release-') as tmp:
    folder = Path(tmp)
    with ZipFile(root / 'releases/BERETS-Plot-Ubuntu-Windows.zip') as archive:
        archive.extractall(folder)
    app = folder / 'BERETS-Plot'
    subprocess.run(['npm.cmd' if os.name == 'nt' else 'npm', 'ci', '--omit=dev',
                    '--prefer-offline', '--no-audit', '--no-fund'],
                   cwd=app, check=True, shell=os.name == 'nt')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with (folder / 'server.log').open('w+') as log:
        process = subprocess.Popen(['node', 'bin/plotterstudio.js', 'server',
                                    '--port', str(port), '--no-open'],
                                   cwd=app, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 20
            while True:
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/app/version', timeout=1) as response:
                        info = json.load(response)
                    assert info['ok'] and info['name'] == 'berets-plot'
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=2) as response:
                        assert b'BERETS Plot' in response.read()
                    print('Portable release server and UI: PASS')
                    break
                except (OSError, ValueError):
                    if process.poll() is not None or time.monotonic() > deadline:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    time.sleep(0.25)
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=10)
