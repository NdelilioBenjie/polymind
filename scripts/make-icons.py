"""Renders the extension icons from the Polymind mark. Run: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps/extension/public/icons"
CIRCLES = [((11.5, 12), "#e5446d"), ((20.5, 12), "#1e88e5"), ((16, 20), "#e09600")]
SCALE = 8  # supersample for smooth edges


def render(size: int) -> Image.Image:
    big = size * SCALE
    unit = big / 32
    colour = Image.new("RGB", (big, big), "white")
    alpha = Image.new("L", (big, big), 0)
    for (cx, cy), fill in CIRCLES:
        box = [(cx - 8.5) * unit, (cy - 8.5) * unit, (cx + 8.5) * unit, (cy + 8.5) * unit]
        layer = Image.new("RGB", (big, big), "white")
        ImageDraw.Draw(layer).ellipse(box, fill=fill)
        colour = ImageChops.multiply(colour, layer)
        ImageDraw.Draw(alpha).ellipse(box, fill=255)
    colour.putalpha(alpha)
    return colour.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    render(size).save(OUT / f"{size}.png")
    print("wrote", OUT / f"{size}.png")
