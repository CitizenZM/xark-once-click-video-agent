"""Local speech-to-text: ffmpeg -> 16 kHz mono wav -> whisper.cpp (whisper-cli) -> text, segments, opening hook."""
import json, os, shutil, subprocess, tempfile, time

PATH = os.pathsep.join(p for p in [os.path.expanduser("~/.local/bin"), "/opt/homebrew/bin", "/usr/local/bin",
                                   "/usr/bin", "/bin", os.environ.get("PATH", "")] if p)
TIMEOUT = float(os.environ.get("ONECLICK_TRANSCRIBE_TIMEOUT") or 120)
HOOK_SECONDS = 3.0
NOT_SET_UP = "Transcription is not set up: brew install whisper-cpp, then download the model (see README)"


def _env_or_which(var, name):
    if var in os.environ:  # tests: a stub path, or empty for "not installed"
        return os.environ[var] or None
    return shutil.which(name, path=PATH)


def find_whisper():
    return _env_or_which("ONECLICK_WHISPER", "whisper-cli")


def find_ffmpeg():
    return _env_or_which("ONECLICK_FFMPEG", "ffmpeg")


def find_model():
    p = os.environ.get("ONECLICK_WHISPER_MODEL") or os.path.expanduser("~/.oneclick/models/ggml-base.en.bin")
    return p if os.path.isfile(p) else None


def in_home(path):
    """Same rule as the download folder: the file must live inside the user's home folder."""
    home = os.path.realpath(os.path.expanduser("~"))
    p = os.path.realpath(os.path.expanduser(path))
    return os.path.commonpath([p, home]) == home


def parse(doc):
    """whisper.cpp -oj output: {"transcription":[{"offsets":{"from":ms,"to":ms},"text":" ..."}]}."""
    segs = []
    for s in doc.get("transcription") or []:
        text = (s.get("text") or "").strip()
        o = s.get("offsets") or {}
        if text:
            segs.append({"start": round(float(o.get("from") or 0) / 1000, 2), "end": round(float(o.get("to") or 0) / 1000, 2), "text": text})
    return segs


def transcribe(file):
    t0 = time.time()
    if not file or not isinstance(file, str):
        return {"ok": False, "error": "No file given"}
    try:
        if not in_home(file):
            return {"ok": False, "error": "File must be inside your home folder"}
    except ValueError:
        return {"ok": False, "error": "File must be inside your home folder"}
    if not os.path.isfile(file):
        return {"ok": False, "error": "File not found"}
    whisper, ffmpeg, model = find_whisper(), find_ffmpeg(), find_model()
    if not (whisper and ffmpeg and model):
        return {"ok": False, "error": NOT_SET_UP}
    env = {**os.environ, "PATH": PATH}
    tmp = tempfile.mkdtemp(prefix="oneclick-tr-")
    try:
        wav, base = os.path.join(tmp, "a.wav"), os.path.join(tmp, "out")
        p = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", file, "-ar", "16000", "-ac", "1", wav],
                           capture_output=True, text=True, timeout=TIMEOUT, env=env)
        if p.returncode != 0 or not os.path.isfile(wav):
            return {"ok": False, "error": "Could not read audio from this file"}
        p = subprocess.run([whisper, "-m", model, "-f", wav, "-oj", "-of", base, "-np"],
                           capture_output=True, text=True, timeout=TIMEOUT, env=env)
        if p.returncode != 0 or not os.path.isfile(base + ".json"):
            return {"ok": False, "error": "Transcription failed: " + ((p.stderr or "").strip().splitlines() or ["whisper-cli error"])[-1][:200]}
        with open(base + ".json", encoding="utf-8") as f:
            segs = parse(json.load(f))
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Transcription timed out"}
    except (OSError, ValueError) as e:
        return {"ok": False, "error": "Transcription failed: %s" % e}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    text = " ".join(s["text"] for s in segs).strip()
    if not text:
        return {"ok": False, "error": "No speech found"}
    hook = " ".join(s["text"] for s in segs if s["start"] < HOOK_SECONDS).strip()
    return {"ok": True, "text": text, "segments": segs, "hook": hook, "seconds": round(time.time() - t0, 2)}
