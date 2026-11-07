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
