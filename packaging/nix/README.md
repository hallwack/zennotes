# Linux packaging (Nix / NixOS)

This directory holds the Nix packaging for ZenNotes.

## Why this exists

NixOS and Nix users expect software to be installable through declarative package definitions rather than manually downloading binaries.

Like the existing AUR and Flatpak packaging, this package uses the official ZenNotes AppImage release and extracts it during the build process. No source rebuild is required.

The resulting package integrates with the desktop environment, installs application icons, and registers the `zennotes://` URI scheme.

## How it works

The package downloads the official AppImage from GitHub Releases and extracts it using Nix's AppImage tooling.

Unlike running the AppImage directly, the extracted application does not require FUSE at runtime.

Files:

* `default.nix` — package definition
* `README.md` — packaging documentation

## Build & install locally

Requires Nix.

```sh
cd packaging/nix

nix-build default.nix
```

Run the application:

```sh
./result/bin/zennotes
```

## Updating to a new release

```sh
cd packaging/nix

# 1. bump `version`
# 2. update the source hash
# 3. rebuild and smoke-test

nix-build default.nix
./result/bin/zennotes
```

To obtain a new hash:

```sh
nix-prefetch-url \
  https://github.com/ZenNotes/zennotes/releases/download/v<version>/ZenNotes-<version>-linux-x86_64.AppImage
```

## Notes & limitations

* The package currently supports `x86_64-linux`.
* The package uses the official AppImage release as its source.
* Automatic updates inside ZenNotes are disabled because Nix packages are immutable.
* Updates should be performed through Nix by updating the package definition.
