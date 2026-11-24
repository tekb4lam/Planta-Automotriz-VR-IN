#!/usr/bin/env python3
"""Genera la narración y los efectos de sonido con ElevenLabs a partir de tools/narracion.json.

Uso:  XI_API_KEY=tu_clave python3 tools/gen_audio.py [--only clave1,clave2] [--force]
- La clave se lee SOLO de la variable de entorno XI_API_KEY (nunca se guarda en el repositorio).
- Salida: assets/audio/voz/<escenario>_<n>.mp3, assets/audio/sfx/<efecto>.mp3 y assets/audio/manifest.json
- Requiere ffmpeg/ffprobe (normaliza volumen, recorta silencios y codifica mp3 mono).
"""
import json, os, subprocess, sys, tempfile, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'narracion.json')
OUT = os.path.join(ROOT, 'assets', 'audio')
API = 'https://api.elevenlabs.io/v1'


def post(url, body, key):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='ignore')[:300]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                continue
            raise SystemExit(f'Error {e.code} en {url}: {msg}')


def finish(raw, dst, lufs, fade_out=0.0, trim=True):
    """Normaliza a `lufs`, recorta silencio inicial/final y guarda mp3 mono."""
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as t:
        t.write(raw)
        tmp = t.name
    filters = []
    if trim:
        filters.append('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05')
        filters.append('areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse')
    filters.append(f'loudnorm=I={lufs}:TP=-1.5:LRA=11')
    if fade_out:
        dur = probe(tmp)
        filters.append(f'afade=t=out:st={max(0, dur - fade_out):.2f}:d={fade_out}')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', ','.join(filters), '-ac', '1', '-ar', '44100',
                    '-c:a', 'libmp3lame', '-b:a', '80k', dst], check=True)
    os.unlink(tmp)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def main():
    key = os.environ.get('XI_API_KEY')
    if not key:
        raise SystemExit('Define XI_API_KEY con tu clave de ElevenLabs.')
    args = sys.argv[1:]
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    force = '--force' in args
    cfg = json.load(open(SRC, encoding='utf-8'))
    os.makedirs(os.path.join(OUT, 'voz'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)

    man = {'voice': cfg['voice_name'], 'model': cfg['model_id'], 'sfx': {}, 'scenarios': {}}

    # efectos de sonido
    for name, s in cfg['sfx'].items():
        dst = os.path.join(OUT, 'sfx', name + '.mp3')
        if (force or not os.path.exists(dst)) and (only is None or name in only):
            print('sfx', name, flush=True)
            raw = post(f'{API}/sound-generation', {'text': s['prompt'], 'duration_seconds': s['dur'], 'prompt_influence': 0.55}, key)
            finish(raw, dst, -19, fade_out=0.25, trim=False)
        if os.path.exists(dst):
            man['sfx'][name] = {'file': f'audio/sfx/{name}.mp3', 'dur': round(probe(dst), 2)}

    # narración
    def voice(clip_id, text):
        dst = os.path.join(OUT, 'voz', clip_id + '.mp3')
        if (force or not os.path.exists(dst)) and (only is None or clip_id in only):
            print('voz', clip_id, flush=True)
            raw = post(f'{API}/text-to-speech/{cfg["voice_id"]}?output_format=mp3_44100_128',
                       {'text': text, 'model_id': cfg['model_id'], 'language_code': 'es'}, key)
            finish(raw, dst, -16)
        return {'file': f'audio/voz/{clip_id}.mp3', 'dur': round(probe(dst), 2)} if os.path.exists(dst) else None

    for sid, sc in cfg['scenarios'].items():
        m = {'intro': voice(f'{sid}_intro', sc['intro']), 'steps': [], 'gate': None, 'outro': voice(f'{sid}_cierre', sc['outro'])}
        for i, st in enumerate(sc['steps']):
            m['steps'].append({'voz': voice(f'{sid}_{i}', st['text']), 'sfx': st.get('sfx')})
        g = sc['gate']
        m['gate'] = {'voz': voice(f'{sid}_bloqueo', g['text']), 'sfx': g.get('sfx')}
        man['scenarios'][sid] = m

    json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('manifest listo')


if __name__ == '__main__':
    main()
