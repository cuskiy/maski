/** The one place app identity and defaults are written. Copy lives in the catalogs. */
export const config = {
  app: {
    name: "maski",
    version: "0.1.0",
    source: "https://github.com/cuskiy/maski",
  },
  homeserver: {
    example: "matrix.org",
  },
  limits: {
    timeline: 80,
    backfill: 60,
    composerRows: 8,
  },
} as const;
