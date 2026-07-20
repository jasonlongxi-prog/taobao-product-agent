#!/usr/bin/env python3
"""Taobao Product Agent: public-link resolver and local image OCR pipeline."""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import requests
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"


def emit(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def fetch_public_page(url: str) -> requests.Response:
    errors: list[str] = []
    retry_policy = Retry(
        total=2,
        connect=2,
        read=1,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    # First respect the machine's configured proxy; if that route fails, retry
    # once without inherited proxy variables. No credentials or cookies are used.
    for trust_environment in (True, False):
        session = requests.Session()
        session.trust_env = trust_environment
        session.mount("https://", HTTPAdapter(max_retries=retry_policy))
        session.mount("http://", HTTPAdapter(max_retries=retry_policy))
        try:
            response = session.get(
                url,
                headers={"User-Agent": UA},
                timeout=(15, 30),
                allow_redirects=True,
            )
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            route = "configured_proxy" if trust_environment else "direct"
            errors.append(f"{route}: {exc}")
        finally:
            session.close()
    raise requests.RequestException("；".join(errors))


def resolve_link(url: str) -> dict:
    if not re.match(r"^https?://", url, re.I):
        raise ValueError("链接必须以 http:// 或 https:// 开头")
    response = fetch_public_page(url)
    text = response.text
    target = response.url
    patterns = [
        r"var\s+url\s*=\s*'([^']+)'",
        r'var\s+url\s*=\s*"([^"]+)"',
        r"window\.location(?:\.replace)?\s*\(?\s*['\"]([^'\"]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            target = html.unescape(match.group(1).replace("\\/", "/"))
            break

    joined = " ".join([url, response.url, target, text[:30000]])
    item_patterns = [
        r"(?:[?&](?:id|itemId|item_id)=)(\d{8,})",
        r"(?:itemId|item_id)[\"']?\s*[:=]\s*[\"']?(\d{8,})",
        r"item/(\d{8,})",
    ]
    item_id = None
    for pattern in item_patterns:
        match = re.search(pattern, joined, re.I)
        if match:
            item_id = match.group(1)
            break

    keyword = None
    try:
        query = parse_qs(urlparse(target).query)
        for key in ("bidword", "keyword", "q"):
            if query.get(key):
                keyword = unquote(query[key][0])
                break
    except Exception:
        pass

    login_markers = ["login", "登录", "验证码", "punish", "访问验证"]
    access_status = "PUBLIC_TARGET_RESOLVED"
    if any(marker.lower() in text.lower() for marker in login_markers):
        access_status = "LOGIN_OR_VERIFICATION_REQUIRED"
    if item_id and ("m.tb.cn" in urlparse(url).netloc or "tb.cn" in urlparse(url).netloc):
        access_status = "SHORT_LINK_RESOLVED_BROWSER_CAPTURE_RECOMMENDED"

    return {
        "source_url": url,
        "http_status": response.status_code,
        "resolved_http_url": response.url,
        "target_url": target,
        "item_id": item_id,
        "associated_keyword": keyword,
        "access_status": access_status,
        "note": "associated_keyword来自分享跟踪参数，不一定等于商品正式标题",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tesseract_languages() -> set[str]:
    result = subprocess.run(
        ["tesseract", "--list-langs"], capture_output=True, text=True, timeout=30, check=True
    )
    return {line.strip() for line in result.stdout.splitlines()[1:] if line.strip()}


def ocr_image(path: Path, workdir: Path, languages: str) -> tuple[str, int]:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size
    if width < 1100:
        scale = min(2.0, 1100 / max(width, 1))
        image = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=1)
    gray = ImageEnhance.Contrast(gray).enhance(1.25)
    gray = gray.filter(ImageFilter.SHARPEN)

    tile_height = 2200
    overlap = 80
    parts: list[str] = []
    tile_count = 0
    top = 0
    while top < gray.height:
        bottom = min(gray.height, top + tile_height)
        tile = gray.crop((0, top, gray.width, bottom))
        tile_path = workdir / f"tile-{tile_count:04d}.png"
        tile.save(tile_path, optimize=True)
        result = subprocess.run(
            ["tesseract", str(tile_path), "stdout", "-l", languages, "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or f"tesseract退出码{result.returncode}")
        cleaned = "\n".join(line.rstrip() for line in result.stdout.splitlines()).strip()
        if cleaned:
            parts.append(cleaned)
        tile_count += 1
        if bottom >= gray.height:
            break
        top = max(top + 1, bottom - overlap)
    return "\n\n".join(parts).strip(), tile_count


def safe_name(value: str) -> str:
    value = re.sub(r"[^0-9A-Za-z._-]+", "_", value).strip("._")
    return value[:140] or "image"


def run_ocr(collection: Path, output: Path) -> dict:
    if not collection.is_dir():
        raise FileNotFoundError(f"采集目录不存在：{collection}")
    manifest_path = collection / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"缺少manifest.json：{manifest_path}")
    if not shutil.which("tesseract"):
        raise RuntimeError("未安装tesseract OCR")
    langs = tesseract_languages()
    if "chi_sim" not in langs:
        raise RuntimeError("未安装简体中文语言包chi_sim")
    language_spec = "chi_sim+eng" if "eng" in langs else "chi_sim"

    output.mkdir(parents=True, exist_ok=True)
    ocr_dir = output / "ocr"
    ocr_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, output / "source-manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    files = sorted(
        p for p in collection.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )
    rows: list[dict] = []
    combined: list[str] = [
        "# 淘宝商品图片OCR汇总",
        "",
        f"- 商品ID：{manifest.get('itemId') or manifest.get('item_id') or '未知'}",
        f"- 页面标题：{manifest.get('title') or '未知'}",
        f"- 来源：{manifest.get('sourceUrl') or manifest.get('source_url') or '未知'}",
        f"- 图片数：{len(files)}",
        "",
    ]
    seen_hashes: dict[str, str] = {}
    success = failed = duplicates = 0

    for index, image_path in enumerate(files, 1):
        rel = image_path.relative_to(collection)
        category = rel.parts[0] if len(rel.parts) > 1 else "uncategorized"
        row = {
            "index": index,
            "file": str(rel).replace("\\", "/"),
            "category": category,
            "bytes": image_path.stat().st_size,
            "width": "",
            "height": "",
            "sha256": "",
            "duplicate_of": "",
            "ocr_chars": 0,
            "status": "pending",
        }
        try:
            digest = file_sha256(image_path)
            row["sha256"] = digest
            with Image.open(image_path) as img:
                row["width"], row["height"] = img.size
                img.verify()
            if digest in seen_hashes:
                row["duplicate_of"] = seen_hashes[digest]
                row["status"] = "duplicate_skipped"
                duplicates += 1
                rows.append(row)
                continue
            seen_hashes[digest] = row["file"]
            with tempfile.TemporaryDirectory(prefix="taobao-ocr-") as tmp:
                text, tiles = ocr_image(image_path, Path(tmp), language_spec)
            text_file = ocr_dir / f"{index:03d}_{safe_name(category)}_{safe_name(image_path.stem)}.txt"
            text_file.write_text(text + ("\n" if text else ""), encoding="utf-8")
            row["ocr_chars"] = len(text)
            row["status"] = "ok"
            row["tiles"] = tiles
            success += 1
            combined.extend([
                f"## {index:03d} · {row['file']}",
                "",
                text if text else "（未识别到清晰文字）",
                "",
            ])
        except Exception as exc:
            row["status"] = "failed"
            row["error"] = str(exc)
            failed += 1
        rows.append(row)

    csv_path = output / "image-inventory.csv"
    fieldnames = sorted({key for row in rows for key in row.keys()}) if rows else ["file"]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    (output / "ocr-combined.md").write_text("\n".join(combined), encoding="utf-8")
    report = {
        "collection": str(collection),
        "output": str(output),
        "images_total": len(files),
        "ocr_success": success,
        "ocr_failed": failed,
        "duplicates_skipped": duplicates,
        "languages": language_spec,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    (output / "ocr-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="淘宝商品分析Agent：链接解析与本地OCR")
    sub = parser.add_subparsers(dest="command", required=True)
    p_resolve = sub.add_parser("resolve", help="解析淘宝短链接/商品链接")
    p_resolve.add_argument("url")
    p_resolve.add_argument("--output", type=Path)
    p_ocr = sub.add_parser("ocr", help="对Chrome采集目录运行OCR")
    p_ocr.add_argument("collection", type=Path)
    p_ocr.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        if args.command == "resolve":
            result = resolve_link(args.url)
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            emit(result)
        elif args.command == "ocr":
            emit(run_ocr(args.collection, args.output))
        return 0
    except Exception as exc:
        emit({"status": "error", "error": str(exc), "command": args.command})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
