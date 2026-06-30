-- Storage buckets for product images and hero banners.
-- Safe to re-apply: ON CONFLICT updates public flag.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('hero-banners',   'hero-banners',   true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = excluded.public;
