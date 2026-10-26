"""Build a minimal importable Prism/PolyMC instance without redistributing mods."""

import hashlib
import io
import json
import sys
import tomllib
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK_URL = 'https://dantetemplar.github.io/civcraft2-lite-modpack/pack.toml'
BOOTSTRAP_URL = 'https://github.com/packwiz/packwiz-installer-bootstrap/releases/download/v0.0.3/packwiz-installer-bootstrap.jar'
BOOTSTRAP_SHA256 = 'a8fbb24dc604278e97f4688e82d3d91a318b98efc08d5dbfcbcbcab6443d116c'


def main() -> None:
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
        # Installer v0.5.14 uses a different NeoForge UID than Prism/PolyMC.
        # Keep loader management in the launcher; Packwiz manages pack files only.
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
            {'uid': 'net.neoforged.neoforge', 'version': pack['versions']['neoforge']},
        ],
    }
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / f'CivCraft2Lite-{pack["version"]}-Packwiz.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('instance.cfg', config)
        archive.writestr('mmc-pack.json', json.dumps(components, indent=2) + '\n')
        archive.writestr('.minecraft/packwiz-installer-bootstrap.jar', bootstrap)
    print(f'Created launcher instance: {output}')
    print('Import into Prism/PolyMC. Restricted CurseForge files must be installed once from the original pack.')


if __name__ == '__main__':
    main()
