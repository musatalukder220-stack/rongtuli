#!/usr/bin/env python3
"""publish.py — এক কমান্ডে নতুন APK প্রকাশ (no GitHub, no assistant needed).

    python3 tools/publish.py --file RongTuli-1.1.apk --version 1.1 --note "Remove ভালো হলো"
    python3 tools/publish.py --file RongTuli-1.1.apk --version 1.1 --note "..." --telegram
    python3 tools/publish.py --file ... --version 1.1 --link https://www.mediafire.com/file/xxxx

What it does:
  1. uploads the .apk to gofile.io (free, no account, direct download page, no waiting screen),
  2. writes latest.json with that link (and, when RT_GH_TOKEN is set, also puts it on GitHub so the
     plain web page can find it),
  3. prints the post to paste into the Telegram channel — this is what phones in the app read.

Only the APK is needed: build it here (python3 tools/release.py --version 1.1 --no-upload) or anywhere else.
"""
import argparse, base64, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.environ.get('RT_GH_TOKEN', '').strip()
REPO = os.environ.get('RT_GH_REPO', '').strip()


def up_gofile(path):
    blob = open(path, 'rb').read()
    b = b'----rt' + os.urandom(8).hex().encode()
    body = b'--' + b + b'\r\n'
    body += ('Content-Disposition: form-data; name="file"; filename="%s"\r\nContent-Type: application/vnd.android.package-archive\r\n\r\n'
             % os.path.basename(path)).encode() + blob + b'\r\n' + b'--' + b + b'--\r\n'
    req = urllib.request.Request('https://upload.gofile.io/uploadfile', data=body, method='POST')
    req.add_header('Content-Type', 'multipart/form-data; boundary=' + b.decode())
    req.add_header('User-Agent', 'Mozilla/5.0')
    with urllib.request.urlopen(req, timeout=1800) as r:
        j = json.loads(r.read())
    if j.get('status') != 'ok':
        raise SystemExit('gofile said: %s' % json.dumps(j)[:300])
    return j['data']['downloadPage']


def put_latest(version, link, note):
    doc = {'version': version, 'link': link, 'note': note, 'force': False}
    text = json.dumps(doc, ensure_ascii=False, indent=2) + '\n'
    open(os.path.join(ROOT, 'latest.json'), 'w', encoding='utf-8').write(text)     # pushed with `release.py code`
    if T and REPO:
        def gh(method, url, body=None):
            req = urllib.request.Request(url, data=(json.dumps(body).encode() if body else None), method=method)
            req.add_header('Authorization', 'Bearer ' + T)
            req.add_header('Accept', 'application/vnd.github+json')
            if body:
                req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b'{}')
        cur = gh('GET', 'https://api.github.com/repos/%s/contents/latest.json' % REPO)
        gh('PUT', 'https://api.github.com/repos/%s/contents/latest.json' % REPO,
           {'message': 'latest.json → ' + version,
            'content': base64.b64encode(text.encode()).decode(), 'sha': cur['sha']})
        print('  latest.json is on GitHub too')
    return doc


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--file', required=False, default='', help='the .apk to publish')
    a.add_argument('--version', required=True)
    a.add_argument('--note', default='')
    a.add_argument('--link', default='', help='upload somewhere else and give the link here')
    a.add_argument('--telegram', action='store_true', help='also try the Telegram bot post (needs RT_TG_TOKEN, RT_TG_CHAT)')
    a = a.parse_args()
    link = a.link
    if not link:
        if not a.file or not os.path.exists(a.file):
            sys.exit('give --file <apk> (or --link <already uploaded download page>)')
        print('uploading %s (%.1f MB)…' % (a.file, os.path.getsize(a.file) / 1048576))
        link = up_gofile(a.file)
        print('  download page: ' + link)
    doc = put_latest(a.version, link, a.note)
    post = 'RongTuli %s\n%s\n%s' % (a.version, a.note or 'নতুন ভার্সন', link)
    print('\n---- Telegram-এ এই পোস্টটা দিন ----\n' + post + '\n----------------------------------')
    if a.telegram and os.environ.get('RT_TG_TOKEN'):
        try:
            data = urllib.parse.urlencode({'chat_id': os.environ['RT_TG_CHAT'], 'text': post}).encode()
            with urllib.request.urlopen('https://api.telegram.org/bot%s/sendMessage' % os.environ['RT_TG_TOKEN'],
                                        data=data, timeout=60) as r:
                print('posted to the channel:', json.loads(r.read()).get('ok'))
        except Exception as e:
            print('the bot could not post (%s) — paste the post by hand' % e)
    print('\nlatest.json:', json.dumps(doc, ensure_ascii=False))


if __name__ == '__main__':
    main()
