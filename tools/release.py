#!/usr/bin/env python3
"""release.py — RongTuli-র আপডেট, এক কমান্ডে (setup + every new version).

You normally do NOT run this yourself — the assistant runs it for you. Two jobs:

  A) ONE TIME:  python3 tools/release.py setup --repo rongtuli --channel https://t.me/your_channel
     * makes the GitHub repo (public) if it is not there,
     * writes latest.json into it,
     * writes the two addresses into the app (src/js/21-update.js and MainActivity.java),
     * builds app/index.html and the APK, and uploads the current APK as a release,
     * prints the address of latest.json — the app now knows where to look.

  B) EVERY VERSION:  python3 tools/release.py --version 1.1 --note "Remove অনেক ভালো"
     * bumps APP_VERSION, builds the page and the APK (same keystore → installs over the old app),
     * uploads the APK to a GitHub release,
     * edits latest.json → everyone with an older app is told on their next start.

The token is never written into any file; it comes from the environment:
    RT_GH_TOKEN   a GitHub token (classic, scope "repo").  It can be revoked any time.
    RT_GH_REPO    owner/repo  (optional: the setup mode can find/create it)
"""
import argparse, base64, json, os, re, subprocess, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F_UTIL = os.path.join(ROOT, 'src/js/00-util.js')
F_UPD = os.path.join(ROOT, 'src/js/21-update.js')
F_JAVA = os.path.join(ROOT, 'android/java/com/rongtuli/photoeditor/MainActivity.java')
TOKEN = os.environ.get('RT_GH_TOKEN', '').strip()
REPO = os.environ.get('RT_GH_REPO', '').strip()


def say(m):
    print(m, flush=True)


def die(m):
    say('✗ ' + m)
    sys.exit(1)


def ver_tuple(v):
    parts = [int(x) for x in re.findall(r'\d+', str(v))]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def app_version():
    m = re.search(r"APP_VERSION = '([^']*)'", open(F_UTIL, encoding='utf-8').read())
    if not m:
        die('APP_VERSION not found in src/js/00-util.js')
    return m.group(1)


def patch(path, old, new, what):
    """put a line like  NAME = '...'  in a file.  Running setup twice is harmless; an older address is replaced."""
    s = open(path, encoding='utf-8').read()
    if old in s:                                     # the stock placeholder is still there
        open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))
        return
    want = re.search(r"('[^']*'|\"[^\"]*\")", new).group(1)
    m = re.search(re.escape(what) + r" = ('[^']*'|\"[^\"]*\")", s)
    if not m:
        die('could not find %s in %s (was it changed?)' % (what, os.path.relpath(path, ROOT)))
    if m.group(1) == want:
        return                                       # already right
    open(path, 'w', encoding='utf-8').write(s[:m.start(1)] + want + s[m.end(1):])


def gh(method, url, body=None, ctype='application/json', raw=None, soft=False):
    """one GitHub call; soft=True returns None instead of stopping on an error"""
    if not TOKEN:
        die('no GitHub token (set RT_GH_TOKEN)')
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + TOKEN)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    if data is not None:
        req.add_header('Content-Type', ctype)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', 'replace')[:500]
        if soft:
            return None
        die('GitHub said %s for %s %s\n%s' % (e.code, method, url, txt))
    except Exception as e:                                   # no internet etc.
        if soft:
            return None
        die('could not reach GitHub: %s' % e)


def whoami():
    me = gh('GET', 'https://api.github.com/user')
    if not me or not me.get('login'):
        die('the token does not look right (no user name came back)')
    return me['login']


def ensure_repo(name, private=False):
    me = whoami()
    full = REPO or (me + '/' + name)
    if gh('GET', 'https://api.github.com/repos/' + full, soft=True):
        say('  repo: %s (already there)' % full)
        return full
    made = gh('POST', 'https://api.github.com/user/repos', {
        'name': name, 'private': bool(private),
        'description': 'RongTuli photo editor — source + APK releases',
        'auto_init': False})
    say('  repo: %s (made)' % full)
    return made.get('full_name', full)


def put_file(repo, path, text, message):
    cur = gh('GET', 'https://api.github.com/repos/%s/contents/%s' % (repo, path), soft=True)
    body = {'message': message, 'content': base64.b64encode(text.encode()).decode()}
    if cur and cur.get('sha'):
        body['sha'] = cur['sha']
    gh('PUT', 'https://api.github.com/repos/%s/contents/%s' % (repo, path), body)
    say('  %s written' % path)


def latest_json(version, link, note, force=False):
    return json.dumps({'version': version, 'link': link, 'note': note, 'force': bool(force)},
                      ensure_ascii=False, indent=2) + '\n'


def raw_url(repo, branch='main'):
    return 'https://raw.githubusercontent.com/%s/%s/latest.json' % (repo, branch)


def check_raw(url):
    """does the address really answer with the JSON? (the app will ask exactly this)"""
    try:
        with urllib.request.urlopen(url + '?t=' + str(int(__import__('time').time())), timeout=30) as r:
            j = json.loads(r.read().decode())
        return j
    except Exception as e:
        say('  ! the address did not answer yet: %s' % e)
        return None


def build_all(with_apk=True):
    run([sys.executable, 'build.py'])
    if with_apk:
        run(['bash', 'tools/build_apk.sh'])


def run(cmd):
    say('  $ ' + ' '.join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        die('%s failed:\n%s%s' % (cmd[0], r.stdout[-1200:], r.stderr[-1200:]))


def upload_apk(repo, apk_path, version, dry=False):
    tag = 'v' + version
    name = os.path.basename(apk_path)
    if dry:
        return 'https://github.com/%s/releases/download/%s/%s' % (repo, tag, name)
    rel = gh('GET', 'https://api.github.com/repos/%s/releases/tags/%s' % (repo, tag), soft=True)
    if not rel:
        rel = gh('POST', 'https://api.github.com/repos/%s/releases' % repo,
                 {'tag_name': tag, 'name': 'RongTuli ' + version, 'target_commitish': 'main',
                  'body': 'RongTuli %s — APK inside.' % version})
    for a in rel.get('assets') or []:
        if a.get('name') == name:                            # replace an older copy of the same file
            gh('DELETE', 'https://api.github.com/repos/%s/releases/assets/%d' % (repo, a['id']), soft=True)
    blob = open(apk_path, 'rb').read()
    out = gh('POST', 'https://uploads.github.com/repos/%s/releases/%d/assets?name=%s' % (repo, rel['id'], name),
             raw=blob, ctype='application/vnd.android.package-archive')
    return (out or {}).get('browser_download_url') or 'https://github.com/%s/releases/tag/%s' % (repo, tag)


# ------------------------------------------------------------------ the source on GitHub

SKIP_EXT = {'.apk', '.keystore', '.onnx', '.wasm', '.zip', '.jpg', '.jpeg', '.png', '.ttf', '.otf', '.woff', '.woff2'}
SKIP_DIR = {'app', 'node_modules', '.git', '__pycache__', 'dist', 'out', 'build', 'shots'}


def source_files():
    """the text of the project that belongs on GitHub (no big binaries, never the keys)"""
    for base, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(base, ROOT).replace('\\', '/')
        if rel == '.':
            rel = ''
        parts = [p for p in rel.split('/') if p]
        if any(p in SKIP_DIR for p in parts):
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if d not in SKIP_DIR]
        for f in files:
            if os.path.splitext(f)[1].lower() in SKIP_EXT:
                continue
            if f == 'password.txt' or f == '.netrc':
                continue
            path = (rel + '/' + f) if rel else f
            if os.path.getsize(os.path.join(base, f)) > 1024 * 1024:
                continue
            yield path, os.path.join(base, f)


def push_code():
    """all the source up to GitHub, in one commit (no git needed: the API does it)"""
    repo = REPO or die('set RT_GH_REPO=owner/repo')
    say('putting the source on GitHub (%s)...' % repo)
    files = list(source_files())
    total = sum(os.path.getsize(p) for _, p in files)
    say('  %d files, %.1f MB' % (len(files), total / 1048576))
    ref = gh('GET', 'https://api.github.com/repos/%s/git/ref/heads/main' % repo, soft=True)
    if not ref:
        # a completely empty repo has no branch yet: one small file makes it, then the real tree follows
        gh('PUT', 'https://api.github.com/repos/%s/contents/README.md' % repo,
           {'message': 'start', 'content': base64.b64encode(b'# RongTuli\n').decode()})
        ref = gh('GET', 'https://api.github.com/repos/%s/git/ref/heads/main' % repo)
    parent = (ref or {}).get('object', {}).get('sha')
    items = []
    for n, (path, full) in enumerate(files, 1):
        blob = gh('POST', 'https://api.github.com/repos/%s/git/blobs' % repo,
                  {'content': base64.b64encode(open(full, 'rb').read()).decode(), 'encoding': 'base64'})
        items.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        if n % 50 == 0:
            say('  %d/%d' % (n, len(files)))
    # latest.json is not part of the source folder: keep the copy that is already up there
    cur = gh('GET', 'https://api.github.com/repos/%s/git/trees/%s?recursive=0' % (repo, parent), soft=True) if parent else None
    if cur:
        for e in cur.get('tree') or []:
            if e.get('path') == 'latest.json' and e.get('type') == 'blob':
                items.append({'path': 'latest.json', 'mode': '100644', 'type': 'blob', 'sha': e['sha']})
    tree = gh('POST', 'https://api.github.com/repos/%s/git/trees' % repo, {'tree': items})
    commit = gh('POST', 'https://api.github.com/repos/%s/git/commits' % repo,
                {'message': 'RongTuli source (version %s)' % app_version(), 'tree': tree['sha'],
                 'parents': ([parent] if parent else [])})
    if parent:
        gh('PATCH', 'https://api.github.com/repos/%s/git/refs/heads/main' % repo,
           {'sha': commit['sha'], 'force': True})
    else:
        gh('POST', 'https://api.github.com/repos/%s/git/refs' % repo,
           {'ref': 'refs/heads/main', 'sha': commit['sha']})
    say('  done — https://github.com/%s/tree/main/src' % repo)


# ------------------------------------------------------------------ the two modes

def do_setup(a):
    say('RongTuli update setup')
    if TOKEN:
        owner_repo = ensure_repo(a.repo, a.private)
    else:
        owner_repo = REPO or ''
        if not owner_repo:
            die('no GitHub token and no repo name (set RT_GH_TOKEN, or RT_GH_REPO=owner/repo)')
        say('  repo: %s (no token: nothing is uploaded, the files are only changed here)' % owner_repo)
    info = raw_url(owner_repo, a.branch)
    say('  latest.json will be read from: ' + info)

    # the current version is published, so nobody is told to update right away
    cur = app_version()
    link = a.channel
    if TOKEN:
        put_file(owner_repo, 'latest.json', latest_json(cur, link, 'RongTuli', False), 'latest.json')

    patch(F_UPD, "Updater.INFO_URL = 'https://gist.githubusercontent.com/OWNER/GISTID/raw/latest.json';",
          "Updater.INFO_URL = '%s';" % info, 'Updater.INFO_URL')
    patch(F_UPD, "Updater.CHANNEL = 'https://t.me/';",
          "Updater.CHANNEL = '%s';" % link, 'Updater.CHANNEL')
    patch(F_JAVA, 'static final String UPDATE_URL = "https://gist.githubusercontent.com/OWNER/GISTID/raw/latest.json";',
          'static final String UPDATE_URL = "%s";' % info, 'UPDATE_URL')
    say('  the app now knows the address (src/js/21-update.js + MainActivity.java)')

    build_all(with_apk=not a.no_apk)
    apk = os.path.join(ROOT, 'android', 'RongTuli-%s.apk' % cur)
    if not a.no_apk:
        got = upload_apk(owner_repo, apk, cur, dry=not TOKEN)
        say('  APK release: ' + got)
        if TOKEN:
            put_file(owner_repo, 'latest.json', latest_json(cur, link, 'RongTuli', False), 'latest.json')

    j = check_raw(info)
    say('\nRead-back from %s: %s' % (info, json.dumps(j, ensure_ascii=False) if j else '(not visible yet — GitHub can take a minute)'))
    say('Done. Install android/RongTuli-%s.apk on the phone.' % cur)


def do_release(a):
    old = app_version()
    if ver_tuple(a.version) <= ver_tuple(old):
        die('the new version must be bigger: the app has %s, you asked for %s' % (old, a.version))
    say('RongTuli %s → %s' % (old, a.version))

    s = open(F_UTIL, encoding='utf-8').read()
    open(F_UTIL, 'w', encoding='utf-8').write(
        re.sub(r"APP_VERSION = '[^']*'", "APP_VERSION = '%s'" % a.version, s, count=1))
    say('  APP_VERSION = %s' % a.version)
    build_all(True)                                     # (the .apk name and its version name come from this number)
    apk = os.path.join(ROOT, 'android', 'RongTuli-%s.apk' % a.version)
    if not a.no_apk:
        if not os.path.exists(apk):
            die('the APK was not written: ' + apk)
        say('  %s (%.1f MB)' % (apk, os.path.getsize(apk) / 1048576))

    if not TOKEN or a.no_upload:
        say('\nNothing was uploaded (no token / --no-upload). The APK is on this computer only.')
        return
    repo = REPO or die('set RT_GH_REPO=owner/repo')
    link = a.link
    if not a.no_apk:
        new = upload_apk(repo, apk, a.version)
        link = link or new
        say('  APK release: ' + new)
    if not link:
        die('no download link')
    doc = latest_json(a.version, link, a.note, a.force)
    open(os.path.join(ROOT, 'latest.json'), 'w', encoding='utf-8').write(doc)     # (pushed with the source too)
    put_file(repo, 'latest.json', doc, 'latest.json → ' + a.version)
    j = check_raw(raw_url(repo, a.branch))
    say('\nlatest.json now: ' + (json.dumps(j, ensure_ascii=False) if j else '(not visible yet)'))
    say('Done — everyone with an older app is told on their next start.')


def main():
    ap = argparse.ArgumentParser(description='RongTuli: set up the update alert, or bring out a new version.')
    ap.add_argument('mode', nargs='?', default='release', choices=['setup', 'release', 'code', 'all'])
    ap.add_argument('--version', default='', help='new version, e.g. 1.1  (release mode)')
    ap.add_argument('--note', default='', help='two or three words shown in the app')
    ap.add_argument('--link', default='', help='download link (default: the GitHub release)')
    ap.add_argument('--force', action='store_true', help='show the sheet until they update')
    ap.add_argument('--repo', default='rongtuli', help='repo name for the setup mode')
    ap.add_argument('--private', action='store_true', help='keep the repo private (then the APK needs another host)')
    ap.add_argument('--branch', default='main')
    ap.add_argument('--channel', default='https://t.me/', help='the owner\'s Telegram channel link')
    ap.add_argument('--no-apk', action='store_true', help='only build the page (fast)')
    ap.add_argument('--no-upload', action='store_true', help='build only, upload nothing')
    a = ap.parse_args()
    if a.mode in ('code', 'all'):
        push_code()
    if a.mode == 'code':
        return
    if a.mode in ('setup', 'all'):
        do_setup(a)
    else:
        if not a.version:
            die('give --version, e.g. --version 1.1')
        do_release(a)


if __name__ == '__main__':
    main()
