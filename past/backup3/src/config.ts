/** The one place project-wide values are written. Copy lives in the catalogs. */
export const config = {
  app: {
    name: "maski",
    version: "0.1.0",
    source: "https://github.com/cuskiy/maski",
  },
  site: {
    origin: "",
  },
  serve: {
    host: "localhost",
    port: 5172,
  },
  homeserver: {
    default: "matrix.org",
  },
  limits: {
    timeline: 80,
    backfill: 60,
    composerRows: 8,
  },
} as const;
