# Linux packaging (Nix / NixOS)

This directory holds the Nix packaging for ZenNotes.

## Why this exists

NixOS and Nix users expect software to be installable through declarative package definitions rather than manually downloading binaries.

Unlike the existing AUR and Flatpak packaging, this package builds the official ZenNotes desktop app from source. Since using AppImages is undesired on Nix as it bloats the nix store. 

## Build locally

Requires Nix.

```sh
nix-build -E 'with import <nixpkgs> {}; callPackage ./package.nix {}'
```

Run the application:

```sh
./result/bin/zennotes
```

## Installing on NixOS

For now as the package is not in the official nixpkgs repo you will need to copy the `package.nix` file into your NixOS configuration and add it to your system packages:

```nix
environment.systemPackages = [
  (pkgs.callPackage ./package.nix { })
];
```

## Updating to a new release

1. Bump `version`:

```nix
# package.nix
# ...
buildNpmPackage (finalAttrs: {
  pname = "zennotes-desktop";
  version = "2.3.0"; # => "2.4.0"
  # ...
```

2. Update the source hash
To obtain a new hash (replace X.X.X with the desired version):

```sh
nix-prefetch-github ZenNotes zennotes --rev "vX.X.X"
```

```nix
  # package.nix
  # ...
  src = fetchFromGitHub {
    owner = "ZenNotes";
    repo = "zennotes";
    tag = "v${finalAttrs.version}";
    hash = "sha256-+tLPVnnMbtMa5blSwHav9ZMlnkUsrdG62mMGxhbmy6g="; # Update the hash
  };
  # ...
```

3. Update the npmDepsHash (if needed)
To obtain a new hash use this command in an updated project root:

```sh
prefetch-npm-deps package-lock.json
```

```nix
  # package.nix
  # ...
  npmDepsHash = "sha256-7IpGnxVjaJvfSZyKjOylGMhFqa1bx8Ry5O1yqYfNnCE="; # Update the hash

  npmWorkspace = "apps/desktop";
  # ...
```

4. Build and test

```sh
nix-build -E 'with import <nixpkgs> {}; callPackage ./package.nix {}'
./result/bin/zennotes
```

## Notes & limitations

* Automatic updates inside ZenNotes are disabled because Nix packages are immutable.
* Updates should be performed through Nix by updating the package definition.
