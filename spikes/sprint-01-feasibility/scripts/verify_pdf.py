from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf
from pypdf import PdfReader


def embedded_font_count(reader: PdfReader) -> int:
    embedded = 0
    visited: set[int] = set()

    def inspect_font(font: object) -> None:
        nonlocal embedded
        resolved = font.get_object() if hasattr(font, "get_object") else font
        identity = id(resolved)
        if identity in visited or not isinstance(resolved, dict):
            return
        visited.add(identity)

        descriptor = resolved.get("/FontDescriptor")
        if descriptor is not None:
            descriptor = descriptor.get_object()
            if any(key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3")):
                embedded += 1

        descendants = resolved.get("/DescendantFonts", [])
        for descendant in descendants:
            inspect_font(descendant)

    for page in reader.pages:
        resources = page.get("/Resources", {}).get_object()
        fonts = resources.get("/Font", {}).get_object()
        for font in fonts.values():
            inspect_font(font)
    return embedded


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_pdf.py INPUT_PDF OUTPUT_DIR")

    pdf_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    document = pymupdf.open(pdf_path)
    if document.page_count != 2:
        raise AssertionError(f"expected 2 pages, got {document.page_count}")

    extracted_pages: list[str] = []
    rendered: list[str] = []
    for page_index, page in enumerate(document):
        extracted_pages.append(page.get_text())
        target = output_dir / f"storyforge-telugu-shaping-spike-page-{page_index + 1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(target)
        rendered.append(str(target))

    combined_text = "\n".join(extracted_pages)
    required_text = [
        "స్టోరీఫోర్జ్ స్టూడియో",
        "INT. రవి ఇల్లు - రాత్రి",
        "బయట వర్షం పడుతోంది.",
        "గుణింతాలు",
        "సంయుక్తాక్షరాలు",
        "Hyderabad",
        "౧౨౩౪౫౬౭౮౯౦",
    ]
    missing = [value for value in required_text if value not in combined_text]

    reader = PdfReader(pdf_path)
    embedded = embedded_font_count(reader)

    summary = {
        "pdf": str(pdf_path),
        "pages": document.page_count,
        "page_sizes_points": [[round(page.rect.width, 2), round(page.rect.height, 2)] for page in document],
        "embedded_font_programs": embedded,
        "unicode_checks": required_text,
        "unicode_roundtrip": "pass" if not missing else "fail",
        "missing_exact_text": missing,
        "rendered_pngs": rendered,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    failures: list[str] = []
    if missing:
        failures.append(f"PDF text extraction missed exact Unicode: {missing}")
    if embedded < 2:
        failures.append(f"expected at least 2 embedded font programs, got {embedded}")
    if failures:
        raise AssertionError("; ".join(failures))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
