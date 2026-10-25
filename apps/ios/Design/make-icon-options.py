from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 1024
SS = 2

def gradient(c0, c1, c2=None, angle=(0.45, 0.9)):
    img = Image.new("RGB", (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = min(1, (x * angle[0] + y * angle[1]) / (S * (angle[0] + angle[1])))
            if c2 is None:
                px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
            elif t < 0.5:
                u = t / 0.5
                px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * u) for i in range(3))
            else:
                u = (t - 0.5) / 0.5
                px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * u) for i in range(3))
    return img

def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)

def centered(draw, text, f, fill, cx=S / 2, cy=S / 2, dy=0):
    box = draw.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text((cx - w / 2 - box[0], cy - h / 2 - box[1] + dy), text, font=f, fill=fill)

def shadowed(base, draw_fn, offset=14, blur=14, alpha=110):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), (255, 255, 255, 255))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, alpha), mask=layer.split()[3])
    sh = sh.filter(ImageFilter.GaussianBlur(blur)).transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -offset))
    out = Image.alpha_composite(base.convert("RGBA"), sh)
    return out

# 1 — rounded monoline, white P + mint A, purple-teal
def opt1():
    base = Image.open("Design/app-icon-ios-1024.png").convert("RGB")
    return base

# 2 — Didot serif on deep navy with gold hairline ring
def opt2():
    bg = gradient((0x0B, 0x14, 0x33), (0x1B, 0x2A, 0x5E))
    img = bg.convert("RGBA")
    d = ImageDraw.Draw(img)
    d.ellipse([112, 112, S - 112, S - 112], outline=(214, 178, 106, 255), width=6)
    f = font("/System/Library/Fonts/Supplemental/Didot.ttc", 470, 2)
    centered(d, "PA", f, (246, 232, 196, 255), dy=-8)
    return img.convert("RGB")

# 3 — two flashcards, front card carries bold PA
def opt3():
    bg = gradient((0x14, 0x9A, 0x8E), (0x2A, 0x6F, 0xD8), (0x5B, 0x3F, 0xD8), angle=(0.9, 0.45))
    img = bg.convert("RGBA")
    back = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(back)
    bd.rounded_rectangle([250, 210, 790, 790], radius=70, fill=(255, 255, 255, 120))
    back = back.rotate(10, resample=Image.BICUBIC, center=(S / 2, S / 2))
    img = Image.alpha_composite(img, back)

    def card(dr, fill):
        dr.rounded_rectangle([230, 250, 770, 830], radius=70, fill=fill)
    img = shadowed(img, card, offset=16, blur=22, alpha=120)
    d = ImageDraw.Draw(img)
    card(d, (255, 255, 255, 255))
    f = font("/System/Library/Fonts/Avenir Next.ttc", 330, 8)
    centered(d, "PA", f, (0x3B, 0x2A, 0xB8, 255), cx=500, cy=540)
    return img.convert("RGB")

# 4 — big P, small A nested in its bowl
def opt4():
    bg = gradient((0x10, 0x14, 0x24), (0x1E, 0x2A, 0x44))
    img = bg.convert("RGBA")
    d = ImageDraw.Draw(img)
    fp = font("/System/Library/Fonts/Avenir Next.ttc", 760, 8)
    centered(d, "P", fp, (255, 255, 255, 255), cx=440, cy=490)
    fa = font("/System/Library/Fonts/Avenir Next.ttc", 430, 8)
    centered(d, "A", fa, (0x16, 0xD6, 0xC8, 255), cx=655, cy=665)
    return img.convert("RGB")

# 5 — lowercase rounded "pa" on warm gradient
def opt5():
    bg = gradient((0xFF, 0x8A, 0x4C), (0xFF, 0x4F, 0x7B), (0x9B, 0x3F, 0xE0))
    img = bg.convert("RGBA")
    def txt(dr, fill):
        f = font("/System/Library/Fonts/SFNSRounded.ttf", 640)
        f.set_variation_by_name("Heavy")
        centered(dr, "pa", f, fill, dy=-30)
    img = shadowed(img, txt, offset=14, blur=16, alpha=100)
    d = ImageDraw.Draw(img)
    txt(d, (255, 255, 255, 255))
    return img.convert("RGB")

options = [opt1, opt2, opt3, opt4, opt5]
sheet = Image.new("RGB", (5 * 320 + 6 * 20, 360), (24, 24, 28))
for i, fn in enumerate(options, 1):
    im = fn()
    im.save(f"Design/icon-options/option-{i}.png")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=225, fill=255)
    small = im.resize((320, 320), Image.LANCZOS)
    m = mask.resize((320, 320), Image.LANCZOS)
    sheet.paste(small, (20 + (i - 1) * 340, 20), m)
sheet.save("Design/icon-options/sheet.png")
