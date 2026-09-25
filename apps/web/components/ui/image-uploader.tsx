'use client';

import * as React from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type SignedUploadDTO, type UploadBucket } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';

/**
 * Uploads an image straight to storage using a short-lived signed URL from
 * the API — the file bytes never pass through our server. Calls `onUploaded`
 * with the public URL to store on the entity. If storage isn't configured on
 * the server it says so plainly, so callers can offer a fallback.
 */
export function ImageUploader({
  bucket,
  entityId,
  onUploaded,
  label = 'Upload photo',
  capture,
}: {
  bucket: UploadBucket;
  entityId?: string;
  onUploaded: (publicUrl: string) => void;
  label?: string;
  /** On phones, open the camera directly instead of the photo library. */
  capture?: 'environment' | 'user';
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);

    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
      return;
    }

    setBusy(true);
    try {
      const signed = await apiClient.post<SignedUploadDTO>('/api/v1/uploads/sign', {
        bucket,
        contentType: file.type,
        entityId,
      });
      let res: Response;
      if (signed.encoding === 'multipart') {
        // Supabase: the same request supabase-js's uploadToSignedUrl makes —
        // a multipart PUT with the file in an unnamed field.
        const form = new FormData();
        form.append('cacheControl', '3600');
        form.append('', file);
        res = await fetch(signed.uploadUrl, { method: 'PUT', body: form });
      } else {
        // Built-in storage: the image bytes as the body, with its own type.
        res = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      }
      if (!res.ok) {
        const detail = await res.json().then((b) => b.error ?? b.message, () => undefined);
        throw new Error(detail ?? `Storage rejected the upload (${res.status})`);
      }
      onUploaded(signed.publicUrl);
    } catch (err) {
      setError(
        err instanceof ApiError && err.statusCode === 503
          ? "Photo upload isn't set up on this server yet."
          : err instanceof Error
            ? err.message
            : 'Upload failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={inputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} capture={capture} className="hidden" onChange={onFile} data-testid="image-input" />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {busy ? 'Uploading…' : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
