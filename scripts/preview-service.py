"""Manage this game's loopback-only macOS preview independently of a terminal."""
from pathlib import Path
import os
import plistlib
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LABEL = 'com.todo.star-chess-party.preview'
DOMAIN = f'gui/{os.getuid()}'
TARGET = f'{DOMAIN}/{LABEL}'
PLIST = Path.home() / 'Library/LaunchAgents' / f'{LABEL}.plist'
LOGS = ROOT / 'logs'
PORT = 8797


def launch(*args, check=True, capture=False):
    return subprocess.run(['launchctl', *args], check=check,
                          capture_output=capture, text=True)


action = sys.argv[1] if len(sys.argv) > 1 else 'status'
if action == 'install':
    node = shutil.which('node')
    vite = ROOT / 'node_modules/vite/bin/vite.js'
    if not node or not vite.is_file():
        raise SystemExit('Node and the existing project dependencies are required.')
    if not (ROOT / 'build/index.html').is_file():
        raise SystemExit('Run npm run build before installing the preview service.')
    if PLIST.exists():
        old = plistlib.loads(PLIST.read_bytes())
        if old.get('WorkingDirectory') != str(ROOT) or old.get('Label') != LABEL:
            raise SystemExit('Existing service belongs to another project; left unchanged.')
    current = launch('print', TARGET, check=False, capture=True)
    pid = re.search(r'^\s*pid = (\d+)', current.stdout, re.MULTILINE)
    listeners = subprocess.run(['lsof', '-nP', '-t', f'-iTCP:{PORT}', '-sTCP:LISTEN'],
                               capture_output=True, text=True, check=False)
    foreign = set(listeners.stdout.split()) - ({pid[1]} if pid else set())
    if foreign:
        raise SystemExit(f'Port {PORT} is used by another process; left unchanged.')
    config = {
        'Label': LABEL,
        'ProgramArguments': [str(Path(node).resolve()), str(vite),
                             'preview', '--host', '127.0.0.1',
                             '--port', str(PORT), '--strictPort'],
        'WorkingDirectory': str(ROOT),
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 10,
        'StandardOutPath': str(LOGS / 'preview.stdout.log'),
        'StandardErrorPath': str(LOGS / 'preview.stderr.log'),
    }
    if current.returncode == 0:
        launch('bootout', TARGET)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    PLIST.write_bytes(plistlib.dumps(config))
    launch('enable', TARGET)
    launch('bootstrap', DOMAIN, str(PLIST))
    launch('kickstart', TARGET)
    print(f'Preview service installed: http://127.0.0.1:{PORT}/')
elif action == 'status':
    launch('print', TARGET)
elif action == 'stop':
    launch('disable', TARGET)
    launch('bootout', TARGET, check=False)
    print('Preview stopped. Run install to enable it again.')
else:
    raise SystemExit('Usage: python3 scripts/preview-service.py [install|status|stop]')
