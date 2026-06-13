# Linux packaging (Nix / NixOS)

This directory holds the Nix packaging for ZenNotes.

## Why this exists

Nix and NixOS users expect software to be installable through declarative package definitions rather than manual downloads.

Like the Arch package and Flatpak manifest, this packaging provides a way to install ZenNotes using the distribution's native package management workflow.

The package downloads the official AppImage release and extracts it during the build process, avoiding AppImage runtime dependencies such as FUSE.

## How it works

The package definition downloads the official AppImage from GitHub releases and extracts it at build time using Nix's AppImage tooling.

No source rebuild is required.

The extracted application is wrapped and installed into the Nix store together with a desktop entry and icon resources.

Files:

* `default.nix` — Nix package definition

## Build locally

Requires Nix.

```sh
cd packaging/nix

nix-build default.nix
```

The resulting application will be available through:

```sh
./result/bin/zennotes
```

## Installing on NixOS

Example:

```nix
environment.systemPackages = [
  (pkgs.callPackage ./packaging/nix/default.nix { })
];
```

## Updating to a new release

```sh
cd packaging/nix

# 1. bump `version`
# 2. update the AppImage hash
# 3. build and test

nix-build default.nix
./result/bin/zennotes
```

To calculate a new hash:

```sh
nix-prefetch-url \
  https://github.com/ZenNotes/zennotes/releases/download/v<version>/ZenNotes-<version>-linux-x86_64.AppImage
```

## Notes & limitations

* The package currently uses the official AppImage release as its source.
* Automatic updates inside the application are disabled because Nix packages are immutable.
* Updates are performed by updating the package definition and rebuilding.
* Currently only `x86_64-linux` is supported because upstream releases only provide an x86_64 AppImage.
