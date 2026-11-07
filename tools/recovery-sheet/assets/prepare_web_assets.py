"""Create a web-serving copy; never alter the canonical supplied logo."""
from pathlib import Path
from PIL import Image

directory = Path(__file__).resolve().parent
source = directory.parents[2] / "assets" / "brand" / "logo-with-domain.png"
with Image.open(source) as image:
    width = min(784, image.width)
    size = (width, round(image.height * width / image.width))
    image.resize(size, Image.Resampling.LANCZOS).save(
        directory / "logo-with-domain.webp", "WEBP", lossless=True, method=6
    )

# Reuse the supplied standalone artwork, without redrawing or recoloring it.
# Both documents inline these icons at build time, including the offline copy.
mark_source = directory.parents[2] / "assets" / "brand" / "logo-prototype.png"
with Image.open(mark_source) as image:
    mark = image.convert("RGBA")
    mark.resize((32, 32), Image.Resampling.LANCZOS).save(
        directory / "favicon-32.png", "PNG", optimize=True
    )
    mark.save(
        directory / "favicon.ico", "ICO",
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
