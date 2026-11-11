"""Join screenshots side by side into one picture:  python3 sheet.py out.png a.png b.png ...  [--w 360]"""
import sys
from PIL import Image
args = sys.argv[1:]
w = 360
if '--w' in args:
    i = args.index('--w'); w = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], args[1:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    ims.append(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS))
H = max(i.height for i in ims)
sheet = Image.new('RGB', (w * len(ims) + 8 * (len(ims) - 1), H), (90, 90, 90))
x = 0
for im in ims:
    sheet.paste(im, (x, 0)); x += w + 8
sheet.save(out)
print(out, sheet.size)
