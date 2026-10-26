"""Attach Packwiz to an existing CivCraft 2 Lite Prism/PolyMC instance."""

import hashlib
import json
import sys
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from build_launcher import BOOTSTRAP_SHA256, BOOTSTRAP_URL, PACK_URL


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: uv run --no-project scripts/attach_instance.py /path/to/instance (close the launcher first)')
    instance = Path(sys.argv[1]).expanduser().resolve(strict=True)
    config_path = instance / 'instance.cfg'
    config = config_path.read_text()
    components = json.loads((instance / 'mmc-pack.json').read_text())
    versions = {component['uid']: component.get('version') for component in components['components']}
    assert versions.get('net.minecraft') == '1.21.1', 'Expected Minecraft 1.21.1'
    neoforge = [component for component in components['components'] if component['uid'] in {'net.neoforged', 'net.neoforged.neoforge'}]
    assert len(neoforge) == 1 and neoforge[0].get('version') == '21.1.247', 'Expected one NeoForge 21.1.247 component'
    minecraft = instance / '.minecraft'
    if not minecraft.is_dir():
        minecraft = instance / 'minecraft'
    assert minecraft.is_dir(), 'Minecraft folder not found'
    assert not (minecraft / 'mods/DynamicTreesTFC-1.21.1-3.0.0-beta5.jar').exists(), 'Apply the Dynamic Trees TFC 3.0.1 fix before attaching; Packwiz cannot remove an untracked old JAR'
    assert (minecraft / 'mods/DynamicTreesTFC-1.21.1-3.0.1.jar').exists(), 'Install the fixed original pack first'
    request = urllib.request.Request(BOOTSTRAP_URL, headers={'User-Agent': 'dantetemplar/civcraft2-lite-modpack'})
    with urllib.request.urlopen(request, timeout=60) as response:
        bootstrap = response.read()
    assert hashlib.sha256(bootstrap).hexdigest() == BOOTSTRAP_SHA256, 'Bootstrap integrity mismatch'
    command = f'"$INST_JAVA" -jar packwiz-installer-bootstrap.jar --multimc-folder .packwiz {PACK_URL}'
    updates = {'OverrideCommands': 'true', 'PreLaunchCommand': command, 'LogPrePostOutput': 'true'}
    lines = []
    for line in config.splitlines():
        key = line.partition('=')[0]
        if key in updates:
            if key == 'PreLaunchCommand' and line.partition('=')[2] not in ('', command):
                raise ValueError('An existing pre-launch command must be reviewed before replacing it')
            lines.append(f'{key}={updates.pop(key)}')
        else:
            lines.append(line)
    lines.extend(f'{key}={value}' for key, value in updates.items())
    backup = instance.parent.parent / 'packwiz-backups' / f'{instance.name}-{datetime.now():%Y%m%d-%H%M%S}.zip'
    backup.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(backup, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ('instance.cfg', 'mmc-pack.json'):
            archive.write(instance / name, name)
        for name in ('config', 'kubejs', 'millenaire', 'millenaire-custom'):
            for path in (minecraft / name).rglob('*'):
                if path.is_file():
                    archive.write(path, path.relative_to(instance))
        for name in ('packwiz-installer-bootstrap.jar', 'packwiz.json'):
            path = minecraft / name
            if path.exists():
                archive.write(path, path.relative_to(instance))
    (minecraft / 'packwiz-installer-bootstrap.jar').write_bytes(bootstrap)
    config_path.write_text('\n'.join(lines) + '\n')
    print(f'Attached Packwiz to {instance}')
    print(f'Backup: {backup}')
    print('Open the launcher again. The next launch will adopt and verify existing pack files.')
    print('No game process was started; saves, accounts and personal options were not modified.')


if __name__ == '__main__':
    main()
