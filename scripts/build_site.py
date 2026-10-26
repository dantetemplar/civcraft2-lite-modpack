"""Validate the Packwiz index and stage only indexed files for GitHub Pages."""

import hashlib
import json
import shutil
import sys
import tomllib
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def checked_path(relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts or '\\' in relative:
        raise ValueError(f'Unsafe pack path: {relative}')
    resolved = (ROOT / relative).resolve(strict=True)
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f'Pack path escapes root: {relative}')
    return resolved


def digest(path: Path, algorithm: str) -> str:
    return hashlib.new(algorithm, path.read_bytes()).hexdigest()


def main() -> None:
    pack = tomllib.loads((ROOT / 'pack.toml').read_text())
    index_path = checked_path(pack['index']['file'])
    assert digest(index_path, pack['index']['hash-format']) == pack['index']['hash'], 'Stale pack index; run packwiz refresh'
    index = tomllib.loads(index_path.read_text())
    selected = ['pack.toml', pack['index']['file'], '.nojekyll']
    destinations = set()
    mods = 0
    for entry in index['files']:
        relative = entry['file']
        source = checked_path(relative)
        assert source.suffix not in {'.jar', '.zip', '.mrpack'}, f'Binary redistribution: {relative}'
        assert source.parts[len(ROOT.parts)] in {'mods', 'config', 'kubejs', 'millenaire', 'millenaire-custom'}, f'Unexpected distribution path: {relative}'
        assert digest(source, entry.get('hash-format', index['hash-format'])) == entry['hash'], f'Stale file hash: {relative}'
        if entry.get('metafile'):
            mod = tomllib.loads(source.read_text())
            filename = mod['filename']
            assert PurePosixPath(filename).name == filename and '\\' not in filename
            destination = str(PurePosixPath(relative).parent / filename)
            assert destination not in destinations, f'Duplicate mod: {destination}'
            destinations.add(destination)
            assert mod.get('side', 'both') in {'client', 'server', 'both'}
            download = mod['download']
            if 'url' in download:
                assert urlparse(download['url']).scheme == 'https', f'Insecure URL: {relative}'
            else:
                assert download['mode'] == 'metadata:curseforge'
            mods += 1
        selected.append(relative)
    web = json.loads((ROOT / 'kubejs/config/web_server.json').read_text())
    assert web['enabled'] is False and not web['auth'], 'Do not distribute a web listener or its credentials'
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.build/site'
    if output.exists():
        raise FileExistsError(f'Refusing to overwrite existing output directory: {output}')
    for relative in selected:
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checked_path(relative), destination)
    print(f'Validated {mods} mod manifests and {len(index["files"])} indexed files; site staged at {output}')


if __name__ == '__main__':
    main()
