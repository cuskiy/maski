{
  description = "maski — a fast, local-first Matrix client";


  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      formatter = forAllSystems (pkgs: pkgs.nixfmt);

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
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
