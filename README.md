# YABR

A background replacer built with Electron based on the _rembg_ library.

## Requirements

- `Python 3.12>` and `pip` must be installed.
- [rembg](https://pypi.org/project/rembg/) library installed globally.

### Install rembg

To install rembg on **linux**, use:

```bash
$ sudo pip install rembg
```

On windows install rembg using `rembg-cli-installer.exe` in [rembg releases](https://github.com/danielgatis/rembg/releases), or open **powershell as admin** and use:

```bash
$ pip install rembg
```

### Test rembg

To be sure if everything is okey and download models, use:

```bash
$ rembg i path/to/image.jpg path/to/output.png
```

## Installing App

### 🪟 Windows

1. Go to [releases](https://github.com/camilopaezz/yabr/releases).
2. Download latest `yabr-x.x.x-setup.exe` or the portable version `yabr-x.x.x.exe`.
3. Double-click .exe file to launch.
4. If you get a **SmartScreen warning** - click **'More Info'** and then **'Run Anyway'** or press **'Yes'** on the unverified publisher dialog.
5. Done! 🥳

### 🐧 Linux

1. Go to [releases](https://github.com/camilopaezz/yabr/releases).
2. Download latest `yabr-x.x.x-.AppImage` or `yabr-x.x.x.tar.gz`.
3. Give to it executable permissions using `$ chmod +x yabr.x.x.x.AppImage` or with your file explorer, usually Rigth-click Properties>Executable.
4. Double-click to launch.
5. Done! 🥳

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
$ npm run build
```

## ❤️ Credits

- Daniel Gatis for his work [rembg](https://github.com/danielgatis/rembg)
- [x6pnda](https://github.com/x6pnda) for his action-electron-compiler.
