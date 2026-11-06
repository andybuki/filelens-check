"""Regenerates the synthetic test files in test/fixtures (Pillow needed)."""
import io, sys, zipfile
from pathlib import Path
from PIL import Image

out = Path(sys.argv[1] if len(sys.argv) > 1 else "test/fixtures")
out.mkdir(parents=True, exist_ok=True)

def exif(orientation=6):
    e = Image.Exif()
    e[0x010F] = "DemoCam"            # Make
    e[0x0110] = "Model X"            # Model
    e[0x0112] = orientation          # Orientation
    e[0x0132] = "2026:07:14 18:22:05"
    gps = {1: "N", 2: (48.0, 51.0, 29.0), 3: "E", 4: (2.0, 17.0, 40.0)}  # Eiffel Tower area
    e[0x8825] = gps
    return e

img = Image.new("RGB", (64, 48), (120, 80, 200))
img.save(out / "gps.jpg", "JPEG", exif=exif(), quality=90)
img.save(out / "gps.png", "PNG", exif=exif(1))
img.save(out / "gps.webp", "WEBP", exif=exif(1), quality=90)
img.save(out / "clean.jpg", "JPEG", quality=90)

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z:
    z.writestr("AndroidManifest.xml", b"\x03\x00\x08\x00fake")
    z.writestr("classes.dex", b"dex\n035\x00")
(out / "wedding_invitation.jpg").write_bytes(buf.getvalue())

(out / "invoice.pdf").write_bytes(b"%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction 2 0 R >> endobj\n2 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\n%%EOF\n")
(out / "report.pdf").write_bytes(b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n")
print("fixtures written to", out)
