CREATE TABLE IF NOT EXISTS geo_spike (
  id serial PRIMARY KEY,
  label text NOT NULL,
  boundary geography(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS geo_spike_boundary_gist ON geo_spike USING GIST (boundary);
