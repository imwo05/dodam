-- Public image delivery with server-issued signed upload URLs.
-- The service-role key is used only by the backend; the browser never gets it.
insert into storage.buckets (id, name, public)
values ('place-images', 'place-images', true)
on conflict (id) do update set public = true;
