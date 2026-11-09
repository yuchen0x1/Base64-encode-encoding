#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
极客工具箱 (Geek Toolbox) —— 全平台应用图标生成器

源图 : assets/icon-source.jpg  (1254x1254，黑色背景 + 蓝色圆角工具箱图标)
依赖 : Pillow >= 10             (pip install Pillow)
运行 : python scripts/generate-icons.py

生成范围：
  public/                     Web favicon / PWA icons / Apple Touch Icon
  build/                      electron-builder 使用的 Windows .ico 与通用 .png
  android/app/src/main/res/   mipmap 启动图标、adaptive foreground、各尺寸 splash
  ios/App/App/Assets.xcassets/ AppIcon 与 Splash

设计要点：
  1. 源图是「纯黑背景 + 蓝色圆角方块」。所有非黑像素均位于圆角方块内部，
     因此用圆角矩形 alpha 蒙版精确抠图，比 flood-fill 更稳定：
     不会被 JPEG 压缩噪点带出黑边，也不会误伤方块内的深色区域（如盾牌阴影）。
  2. 透明背景版本用于 Web / Electron / Android legacy launcher。
  3. 不透明满幅版本用于 iOS AppIcon / Apple Touch / PWA maskable，
     符合「不得含 alpha 通道、不得自带圆角」的平台规范；四角用项目主背景色填充。
  4. Android adaptive icon foreground 遵循 108dp 画布约定，内容缩到约 62%
     居中，保证圆形蒙版下工具箱主体完整；背景色由
     res/values/ic_launcher_background.xml 提供（#090D16）。
  5. 各平台输出尺寸优先从现有文件读取，避免硬编码密度表漂移。
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
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"

# 与 index.html 的 theme-color / 窗口 backgroundColor / manifest 保持一致
BG = (9, 13, 22, 255)  # #090D16

# 源图中蓝色圆角方块的实测包围盒与圆角半径（1254x1254 坐标系）
ICON_BOX = (95, 95, 1155, 1155)
ICON_RADIUS = 235
SUPERSAMPLE = 3  # 蒙版超采样，消除边缘锯齿

LANCZOS = Image.Resampling.LANCZOS


def build_core() -> Image.Image:
    """抠出蓝色圆角方块，返回内容满幅的 RGBA 图（四角透明）。"""
    if not SOURCE.exists():
        sys.exit(f"找不到源图：{SOURCE}")

    src = Image.open(SOURCE).convert("RGBA")
    w, h = src.size

    mask = Image.new("L", (w * SUPERSAMPLE, h * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        tuple(v * SUPERSAMPLE for v in ICON_BOX),
        radius=ICON_RADIUS * SUPERSAMPLE,
        fill=255,
    )
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


def opaque(core: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    """不透明满幅版本：主背景色打底 + 居中图标，输出 RGB（无 alpha）。"""
    out = Image.new("RGBA", (size, size), BG)
    out.alpha_composite(transparent(core, size, scale))
    return out.convert("RGB")


def round_icon(core: Image.Image, size: int) -> Image.Image:
    """Android ic_launcher_round：圆形不透明底 + 居中图标，圆外透明。"""
    base = opaque(core, size, 0.92).convert("RGBA")
    mask = Image.new("L", (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).ellipse(
        (0, 0, size * SUPERSAMPLE - 1, size * SUPERSAMPLE - 1), fill=255
    )
    base.putalpha(mask.resize((size, size), LANCZOS))
    return base


def splash(core: Image.Image, w: int, h: int, fraction: float = 0.36) -> Image.Image:
    """启动画面：主背景色 + 居中图标，返回 RGB。"""
    out = Image.new("RGBA", (w, h), BG)
    side = max(1, round(min(w, h) * fraction))
    layer = core.resize((side, side), LANCZOS)
    out.alpha_composite(layer, dest=((w - side) // 2, (h - side) // 2))
    return out.convert("RGB")


def write_ico(core: Image.Image, path: Path) -> None:
    """多尺寸 Windows ICO（含 256x256，满足 electron-builder / NSIS 要求）。"""
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    transparent(core, 256).save(path, format="ICO", sizes=sizes)


def generate_web(core: Image.Image) -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    write_ico(core, PUBLIC / "favicon.ico")
    transparent(core, 32).save(PUBLIC / "favicon-32.png")
    transparent(core, 192).save(PUBLIC / "icon-192.png")
    transparent(core, 512).save(PUBLIC / "icon-512.png")
    # maskable: 内容收进中心 80% 安全圆内
    opaque(core, 192, 0.76).save(PUBLIC / "icon-maskable-192.png")
    opaque(core, 512, 0.76).save(PUBLIC / "icon-maskable-512.png")
    # Apple Touch Icon 由系统加圆角，使用不透明满幅图
    opaque(core, 180).save(PUBLIC / "apple-touch-icon.png")
    print(f"  Web / PWA       -> {PUBLIC.relative_to(ROOT)}/ (favicon.ico, icon-*.png, apple-touch-icon.png)")


def generate_electron(core: Image.Image) -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    write_ico(core, BUILD / "icon.ico")
    transparent(core, 512).save(BUILD / "icon.png")
    transparent(core, 1024).save(BUILD / "icon-1024.png")
    print(f"  Electron        -> {BUILD.relative_to(ROOT)}/ (icon.ico, icon.png, icon-1024.png)")


def generate_android(core: Image.Image) -> None:
    if not ANDROID_RES.exists():
        print("  Android         -> 跳过（未找到 res 目录）")
        return

    count = 0
    for density_dir in sorted(ANDROID_RES.glob("mipmap-*")):
        if "anydpi" in density_dir.name:
            continue
        for name, maker in (
            ("ic_launcher.png", lambda s: transparent(core, s)),
            ("ic_launcher_round.png", lambda s: round_icon(core, s)),
            # 108dp 画布，内容约 62% 居中，落在 66dp 圆形安全区内
            ("ic_launcher_foreground.png", lambda s: transparent(core, s, 0.62)),
        ):
            path = density_dir / name
            if not path.exists():
                continue
            with Image.open(path) as old:
                side = old.size[0]
            maker(side).save(path)
            count += 1

    for path in sorted(ANDROID_RES.glob("drawable*/*.png")):
        if path.name != "splash.png":
            continue
        with Image.open(path) as old:
            w, h = old.size
        splash(core, w, h).save(path)
        count += 1

    print(f"  Android         -> {count} 个文件已更新")


def generate_ios(core: Image.Image) -> None:
    app_icon = IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png"
    if app_icon.exists():
        # iOS 要求 1024x1024、不透明、无圆角、无 alpha 通道
        opaque(core, 1024).save(app_icon, format="PNG")
        print(f"  iOS AppIcon     -> {app_icon.relative_to(ROOT)}")

    count = 0
    for path in sorted((IOS_ASSETS / "Splash.imageset").glob("*.png")):
        with Image.open(path) as old:
            w, h = old.size
        splash(core, w, h).save(path)
        count += 1
    if count:
        print(f"  iOS Splash      -> {count} 个文件已更新")


def main() -> None:
    core = build_core()
    print(f"源图: {SOURCE.relative_to(ROOT)}  抠图尺寸: {core.size}")
    generate_web(core)
    generate_electron(core)
    generate_android(core)
    generate_ios(core)
    print("完成。请执行 npm run build 让 public/ 下的图标同步到 dist/。")


if __name__ == "__main__":
    main()
