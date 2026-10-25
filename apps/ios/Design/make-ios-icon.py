from PIL import Image, ImageDraw, ImageFilter
import math

S = 2048
K = S / 1024

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

bg = Image.new("RGB", (S, S))
px = bg.load()
c0, c1, c2 = (0x2A, 0x1F, 0x8F), (0x6D, 0x3F, 0xD8), (0x16, 0xB8, 0xB0)
for y in range(S):
    for x in range(S):
        t = (x * 0.45 + y * 0.9) / (S * 1.35)
        px[x, y] = lerp(c0, c1, t / 0.55) if t < 0.55 else lerp(c1, c2, (t - 0.55) / 0.45)

def stroke(draw, pts, width, fill):
    r = width / 2
    for a, b in zip(pts, pts[1:]):
        draw.line([a, b], fill=fill, width=int(width))
    for p in pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)

def arc_points(cx, cy, r, a0, a1, n=48):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

W = 102 * K
def sc(pts):
    return [(x * K, y * K) for x, y in pts]

def layer(fill):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    return img, d

p_img, pd = layer(None)
stem = sc([(290, 270), (290, 770)])
bowl = sc([(290, 270), (400, 270)] + arc_points(400, 410, 140, -90, 90) + [(290, 550)])
stroke(pd, stem, W, (255, 255, 255, 255))
stroke(pd, bowl, W, (255, 255, 255, 255))

a_img, ad = layer(None)
stroke(ad, sc([(585, 770), (715, 270), (845, 770)]), W, (190, 250, 244, 255))
stroke(ad, sc([(645, 600), (785, 600)]), W * 0.8, (190, 250, 244, 255))

shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
for src in (p_img, a_img):
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 90), mask=src.split()[3])
    shadow = Image.alpha_composite(shadow, sh)
shadow = shadow.filter(ImageFilter.GaussianBlur(18 * K)).transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -14 * K))

out = bg.convert("RGBA")
out = Image.alpha_composite(out, shadow)
out = Image.alpha_composite(out, a_img)
out = Image.alpha_composite(out, p_img)
out.convert("RGB").resize((1024, 1024), Image.LANCZOS).save("Design/app-icon-ios-1024.png")
