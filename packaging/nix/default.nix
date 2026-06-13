{
  stdenv,
  lib,
  appimageTools,
  fetchurl,
}:
let
  pname = "zennotes";
  version = "2.3.0";

  architectures = {
    "x86_64-linux" = {
      arch = "linux-x86_64";
      hash = "sha256-IvFGK7n3KQVGETmt6hQUy+bZNTOCkfuwH8ifl4KTxxw=";
    };
  };

  system =
    architectures.${stdenv.hostPlatform.system}
      or (throw "Unsupported system: ${stdenv.hostPlatform.system}. Supported systems are: ${lib.attrNames architectures}");

  src =
    let
      inherit (system) arch hash;
    in
    fetchurl {
      url = "https://github.com/ZenNotes/zennotes/releases/download/v${version}/ZenNotes-${version}-${arch}.AppImage";
      inherit hash;
    };

  appImageContents = appimageTools.extractType2 {
    inherit pname version src;
  };
in
appimageTools.wrapType2 {
  inherit pname version src;

  extraInstallCommands = ''
    mkdir -p $out/share/applications

    cat > $out/share/applications/${pname}.desktop <<EOF
    [Desktop Entry]
    Name=ZenNotes
    Comment=Keyboard-first local Markdown notes
    Exec=${pname} %U
    Terminal=false
    Type=Application
    Icon=ZenNotes
    StartupWMClass=ZenNotes
    MimeType=text/markdown;x-scheme-handler/zennotes;
    Categories=Office;TextEditor;
    EOF

    cp -r ${appImageContents}/usr/share/icons $out/share
  '';

  meta = with lib; {
    description = "Keyboard-first local Markdown notes";
    homepage = "https://zennotes.org/";
    license = licenses.mit;
    mainProgram = pname;
    platforms = builtins.attrNames architectures;
  };
}
