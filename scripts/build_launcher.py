"""Build a minimal importable Prism/PolyMC instance without redistributing mods."""

import argparse
import hashlib
import io
import json
import tomllib
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Account-level GitHub Pages currently redirects to an expired custom domain.
# Raw GitHub provides a working HTTPS update origin without changing that domain.
PACK_URL = 'https://raw.githubusercontent.com/dantetemplar/civcraft2-lite-modpack/main/pack.toml'
BOOTSTRAP_URL = 'https://github.com/packwiz/packwiz-installer-bootstrap/releases/download/v0.0.3/packwiz-installer-bootstrap.jar'
BOOTSTRAP_SHA256 = 'a8fbb24dc604278e97f4688e82d3d91a318b98efc08d5dbfcbcbcab6443d116c'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path)
    parser.add_argument('--launcher', choices=('prism', 'polymc'), default='prism', help='Freesm uses the Prism format')
    args = parser.parse_args()
    neoforge_uid = 'net.neoforged' if args.launcher == 'prism' else 'net.neoforged.neoforge'
    pack = tomllib.loads((ROOT / 'pack.toml').read_text())
    request = urllib.request.Request(BOOTSTRAP_URL, headers={'User-Agent': 'dantetemplar/civcraft2-lite-modpack'})
    with urllib.request.urlopen(request, timeout=60) as response:
        bootstrap = response.read()
    assert hashlib.sha256(bootstrap).hexdigest() == BOOTSTRAP_SHA256, 'Bootstrap integrity mismatch'
    assert zipfile.is_zipfile(io.BytesIO(bootstrap)), 'Bootstrap must be a JAR'
    config = '\n'.join([
        'InstanceType=OneSix',
        'name=CivCraft 2 Lite (Packwiz)',
        'iconKey=default',
        'OverrideCommands=true',
        # Keep loader management in the launcher; Prism/Freesm and PolyMC use different NeoForge UIDs.
        # Packwiz manages pack files only.
        f'PreLaunchCommand="$INST_JAVA" -jar packwiz-installer-bootstrap.jar --multimc-folder .packwiz {PACK_URL}',
        'LogPrePostOutput=true',
        'OverrideMemory=true',
        'MinMemAlloc=1024',
        'MaxMemAlloc=8192',
        '',
    ])
    components = {
        'formatVersion': 1,
        'components': [
            {'uid': 'net.minecraft', 'version': pack['versions']['minecraft'], 'important': True},
            {'uid': neoforge_uid, 'version': pack['versions']['neoforge']},
        ],
    }
    label = 'Prism-Freesm' if args.launcher == 'prism' else 'PolyMC'
    output = args.output or ROOT / f'CivCraft2Lite-{pack["version"]}-{label}-Packwiz.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('instance.cfg', config)
        archive.writestr('mmc-pack.json', json.dumps(components, indent=2) + '\n')
        archive.writestr('.minecraft/packwiz-installer-bootstrap.jar', bootstrap)
    print(f'Created launcher instance: {output}')
    print(f'Import into {label}. Restricted CurseForge files must be installed once from the original pack.')


if __name__ == '__main__':
    main()
