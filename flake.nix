{
  description = "maski - a fast, local-first Matrix client";
  inputs = {
    nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.zst";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-linux" "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      formatter = forAllSystems (pkgs: pkgs.nixfmt);

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.typescript
            pkgs.typescript-language-server
            pkgs.prettier
            pkgs.eslint
            pkgs.tailwindcss-language-server
            pkgs.vscode-langservers-extracted
            pkgs.ast-grep
            pkgs.chromium
            pkgs.nixfmt
          ];
          shellHook = ''
            # The browser tests launch this build instead of letting Playwright fetch one: a
            # downloaded Chromium does not run on NixOS without patching.
            export MASKI_CHROMIUM=${pkgs.chromium}/bin/chromium
          '';
        };
      });
    };
}
