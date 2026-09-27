-- 0007_photo_meta — what a photo's own metadata says, kept for the operator
-- and never served. The public copy in R2 is stripped; the raw EXIF block
-- sits under meta/ in the same bucket, read only by the admin page.

ALTER TABLE worker_photo ADD COLUMN lat REAL;
ALTER TABLE worker_photo ADD COLUMN lon REAL;
ALTER TABLE worker_photo ADD COLUMN alt REAL;
ALTER TABLE worker_photo ADD COLUMN taken_at TEXT;      -- DateTimeOriginal as written by the camera (local time, no zone)
ALTER TABLE worker_photo ADD COLUMN device TEXT;        -- Make + Model
ALTER TABLE worker_photo ADD COLUMN meta_key TEXT;      -- R2 key of the raw EXIF block, when there was one
ALTER TABLE worker_photo ADD COLUMN meta_source TEXT;   -- 'upload' (in the file) | 'browser' (sent beside a redrawn photo)
ALTER TABLE worker_photo ADD COLUMN near_zone TEXT;     -- nearest operator zone to the GPS fix
ALTER TABLE worker_photo ADD COLUMN near_km REAL;

-- Text the vision model read off the photo (signs, shop names, numbers, QR
-- codes), as JSON. Kept for the operator; never served.
ALTER TABLE worker_photo ADD COLUMN seen_text TEXT;
