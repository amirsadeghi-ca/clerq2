"""Generate 1200x630 Open Graph social-share images for the marketing site.
Run in the api container (has pymupdf/fitz), then copy PNGs to website/.
    docker compose exec -T api python - < samples/_og_gen.py
"""
import os
import fitz

OUT = "/app/data/_og"
os.makedirs(OUT, exist_ok=True)


def c(hexs):
    return tuple(int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4))


NAVY = c("060e1a")
GOLD = c("D4920A")
BLACK = c("0a0a0a")
INDIGO = c("6366f1")
WHITE = (1, 1, 1)
CREAM = c("e9e6df")
MUTE = c("9aa3b2")


def make(name, bg, accent, label, line1, line2, sub, url, headline_color=WHITE):
    doc = fitz.open()
    page = doc.new_page(width=1200, height=630)
    page.draw_rect(fitz.Rect(0, 0, 1200, 630), fill=bg, color=bg)
    # left accent bar
    page.draw_rect(fitz.Rect(0, 0, 16, 630), fill=accent, color=accent)
    # subtle accent block top-right
    page.draw_rect(fitz.Rect(1040, 70, 1120, 86), fill=accent, color=accent)
    # eyebrow label
    page.insert_text((90, 150), label, fontsize=22, fontname="hebo", color=accent)
    # headline (two lines)
    page.insert_text((88, 290), line1, fontsize=74, fontname="hebo", color=headline_color)
    page.insert_text((88, 372), line2, fontsize=74, fontname="hebo", color=headline_color)
    # subtitle
    page.insert_text((90, 470), sub, fontsize=27, fontname="helv", color=CREAM)
    # url
    page.insert_text((90, 565), url, fontsize=23, fontname="hebo", color=accent)
    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
    path = os.path.join(OUT, name)
    pix.save(path)
    print("  og   ", name, pix.width, "x", pix.height)


make("og-genitechs.png", NAVY, GOLD, "GENITECHS",
     "AI you can put into", "production — and defend.",
     "AI design, app & integration studio for public & private teams.",
     "genitechs.ca")

make("og-interpret.png", BLACK, INDIGO, "INTERPRET  BY  GENITECHS",
     "Document validation", "you can defend.",
     "Reads the whole dossier. Checks your rules. Produces a traceable report.",
     "genitechs.ca/interpret")

make("og-immigration.png", BLACK, INDIGO, "INTERPRET  ·  IMMIGRATION",
     "Submit applications", "that don't come back.",
     "AI completeness & cross-document consistency checks before IRCC.",
     "genitechs.ca/interpret/immigration")

make("og-mortgage.png", BLACK, INDIGO, "INTERPRET  ·  MORTGAGE",
     "Lender-ready files,", "first time.",
     "Reconcile income, dates and names across the borrower package.",
     "genitechs.ca/interpret/mortgage")

make("og-onboarding.png", BLACK, INDIGO, "INTERPRET  ·  HR & PEOPLE OPS",
     "Every new hire,", "cleared to start.",
     "Complete, valid onboarding packs confirmed before day one.",
     "genitechs.ca/interpret/onboarding")

print("done")
