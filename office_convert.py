# -*- coding: utf-8 -*-
"""Köhnə OLE .ppt / səhv adlı PPTX-i PDF-ə çevirir (Windows + PowerPoint)."""
from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
import time
from pathlib import Path

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ZIP_MAGIC = b"PK"
PDF_MAGIC = b"%PDF"

_CACHE_DIR = Path(__file__).resolve().parent / "data" / "att_preview_cache"


def is_ole_bytes(data: bytes) -> bool:
    return bool(data) and data[:8].startswith(OLE_MAGIC[:4]) and data[:4] == OLE_MAGIC[:4]


def is_zip_bytes(data: bytes) -> bool:
    return bool(data) and data[:2] == ZIP_MAGIC


def is_pdf_bytes(data: bytes) -> bool:
    return bool(data) and data[:4] == PDF_MAGIC


def is_mip_protected_pdf(data: bytes) -> bool:
    """Microsoft Information Protection / IRM stub və ya şifrəli PDF."""
    if not is_pdf_bytes(data):
        return False
    sample = data[: min(len(data), 160000)]
    needles = (
        b"Microsoft Information Protection",
        b"MicrosoftIRMServices",
        b"Azure Rights Management",
        b"encryption powered by Microsoft",
        b"Protected PDF.pdf",
        b"You're seeing this page either because you are not authorized",
    )
    return any(n in sample for n in needles)


def is_presentation_filename(filename: str) -> bool:
    name = str(filename or "").lower()
    return name.endswith((".ppt", ".pptx", ".pptm", ".pps", ".ppsx"))


def _cache_path(att_id: str, payload: bytes) -> Path:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(payload[:65536] + str(len(payload)).encode()).hexdigest()[:16]
    safe_id = "".join(ch for ch in str(att_id or "x") if ch.isalnum() or ch in "-_")[:40]
    return _CACHE_DIR / ("%s_%s.pdf" % (safe_id or "att", digest))


def _powerpoint_available() -> bool:
    candidates = [
        r"C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE",
        r"C:\Program Files\Microsoft Office\Office16\POWERPNT.EXE",
        r"C:\Program Files (x86)\Microsoft Office\root\Office16\POWERPNT.EXE",
    ]
    return any(os.path.isfile(p) for p in candidates)


def _ps_literal(path: Path) -> str:
    """PowerShell single-quoted literal."""
    return "'" + str(path).replace("'", "''") + "'"


def _convert_with_powerpoint(src: Path, dst: Path) -> None:
    """PowerPoint COM vasitəsilə PDF yazır."""
    ps = (
        "$ErrorActionPreference = 'Stop'\n"
        "$src = " + _ps_literal(src) + "\n"
        "$dst = " + _ps_literal(dst) + "\n"
        "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }\n"
        "$pp = New-Object -ComObject PowerPoint.Application\n"
        "try {\n"
        "  try { $pp.Visible = -1 } catch {}\n"
        "  try { $pp.DisplayAlerts = 1 } catch {}\n"
        "  $pres = $pp.Presentations.Open($src, $true, $false, $false)\n"
        "  try {\n"
        "    $pres.SaveAs($dst, 32)\n"
        "  } finally {\n"
        "    $pres.Close()\n"
        "    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres)\n"
        "  }\n"
        "} finally {\n"
        "  $pp.Quit()\n"
        "  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp)\n"
        "  [GC]::Collect()\n"
        "  [GC]::WaitForPendingFinalizers()\n"
        "}\n"
        "if (-not (Test-Path -LiteralPath $dst)) { throw 'PDF yaranmadı' }\n"
    )
    creation = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command", ps,
        ],
        capture_output=True,
        text=True,
        timeout=180,
        creationflags=creation,
    )
    if proc.returncode != 0 or not dst.is_file():
        err = (proc.stderr or proc.stdout or "").strip() or ("exit %s" % proc.returncode)
        raise RuntimeError(err[:500])


def maybe_convert_presentation_to_pdf(payload: bytes, filename: str = "", att_id: str = ""):
    """
    OLE .ppt (və ya .pptx adlı OLE) → PDF bytes.
    Uğursuzdursa (None, reason) qaytarır; uğurda (pdf_bytes, None).
    """
    if not payload:
        return None, "boş fayl"
    if is_pdf_bytes(payload) or is_zip_bytes(payload):
        return None, None  # çevirmə lazım deyil
    if not is_ole_bytes(payload):
        return None, "naməlum format"
    if filename and not is_presentation_filename(filename):
        # MIME/ad yoxdursa belə OLE + presentation id ilə cəhd et
        if not att_id:
            return None, "təqdimat deyil"

    cached = _cache_path(att_id or "x", payload)
    if cached.is_file() and cached.stat().st_size > 100:
        cached_pdf = cached.read_bytes()
        if is_mip_protected_pdf(cached_pdf):
            try:
                cached.unlink()
            except Exception:
                pass
            return None, "MIP/IRM şifrəli (PDF stub)"
        return cached_pdf, None

    if not _powerpoint_available():
        return None, "PowerPoint tapılmadı"

    suffix = ".ppt"
    low = str(filename or "").lower()
    if low.endswith(".pptx"):
        suffix = ".pptx"
    elif low.endswith(".pptm"):
        suffix = ".pptm"
    elif low.endswith(".ppsx"):
        suffix = ".ppsx"
    elif low.endswith(".pps"):
        suffix = ".pps"

    tmp_dir = tempfile.mkdtemp(prefix="jira-ppt-")
    src = Path(tmp_dir) / ("source" + suffix)
    dst = Path(tmp_dir) / "out.pdf"
    try:
        src.write_bytes(payload)
        _convert_with_powerpoint(src, dst)
        # COM bəzən faylı gec bağlayır
        for _ in range(20):
            if dst.is_file() and dst.stat().st_size > 100:
                break
            time.sleep(0.15)
        if not dst.is_file() or dst.stat().st_size < 100:
            return None, "PDF yaranmadı"
        pdf = dst.read_bytes()
        if not is_pdf_bytes(pdf):
            return None, "PDF formatı yanlışdır"
        if is_mip_protected_pdf(pdf):
            # PowerPoint hüququ olmayanda MIP stub yazır — brauzerdə faydasızdır
            return None, "MIP/IRM şifrəli (PDF stub)"
        try:
            cached.write_bytes(pdf)
        except Exception:
            pass
        return pdf, None
    except Exception as e:
        return None, str(e)[:300]
    finally:
        for p in (src, dst):
            try:
                if p.is_file():
                    p.unlink()
            except Exception:
                pass
        try:
            os.rmdir(tmp_dir)
        except Exception:
            pass
