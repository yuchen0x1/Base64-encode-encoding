#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Windows 安装图标、窗口图标和渲染界面 favicon。

源图：assets/icon-source.jpg；依赖：Pillow；运行：python scripts/generate-icons.py。
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("缺少 Pillow，请先执行：pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon-source.jpg"
PUBLIC = ROOT / "public"
BUILD = ROOT / "build"
ICON_BOX = (95, 95, 1155, 1155)
ICON_RADIUS = 235
SUPERSAMPLE = 3
# Pillow 10 exposes resampling filters through ``Image.Resampling`` while
# older supported Pillow releases keep the constants on ``Image`` itself.
LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS")


def build_core() -> Image.Image:
    """抠出蓝色圆角方块，返回内容满幅的 RGBA 图（四角透明）。"""
    if not SOURCE.exists():
        sys.exit(f"找不到源图：{SOURCE}")

    src = Image.open(SOURCE).convert("RGBA")
    w, h = src.size

    mask = Image.new("L", (w * SUPERSAMPLE, h * SUPERSAMPLE), 0)
    draw = ImageDraw.Draw(mask)
    box = tuple(v * SUPERSAMPLE for v in ICON_BOX)
    rounded_rectangle = getattr(draw, "rounded_rectangle", None)
    if rounded_rectangle:
        rounded_rectangle(box, radius=ICON_RADIUS * SUPERSAMPLE, fill=255)
    else:
        # Pillow versions without rounded_rectangle still produce a valid
        # installer icon; the subsequent resize keeps the edge antialiased.
        draw.rectangle(box, fill=255)
    mask = mask.resize((w, h), LANCZOS)
    src.putalpha(mask)
    return src.crop(ICON_BOX)


def transparent(core: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    """透明画布 + 居中图标。scale < 1 时四周留白（用于安全区）。"""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    side = max(1, round(size * scale))
    layer = core.resize((side, side), LANCZOS)
    out.alpha_composite(layer, dest=((size - side) // 2, (size - side) // 2))
    return out


def write_ico(core: Image.Image, path: Path) -> None:
    """多尺寸 Windows ICO（含 256x256，满足 electron-builder / NSIS 要求）。"""
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    transparent(core, 256).save(path, format="ICO", sizes=sizes)


def main() -> None:
    core = build_core()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    write_ico(core, PUBLIC / "favicon.ico")
    transparent(core, 32).save(PUBLIC / "favicon-32.png")
    transparent(core, 512).save(PUBLIC / "icon-512.png")
    write_ico(core, BUILD / "icon.ico")
    transparent(core, 512).save(BUILD / "icon.png")
    print("Windows 图标生成完成。请执行 npm run build 同步到 dist/。")


if __name__ == "__main__":
    main()
