/**
 * questionImageUpload.ts — single upload path for every STUDENT-VISIBLE
 * question image (auto-snips, pasted screenshots, manual uploads).
 *
 * Why this exists: these images used to be uploaded to the `exam-pdfs`
 * bucket, which the migrations create PRIVATE — a `getPublicUrl` against a
 * private bucket 403s for anyone who isn't the owner. The `question-images`
 * bucket was created public (and policy-covered) for exactly this content,
 * so all new image uploads go there.
 *
 * Fallback: if the live project doesn't have the `question-images` bucket
 * yet (storage migration not applied), fall back to `exam-pdfs` — identical
 * to the old behavior, so an unapplied migration can never break imports.
 *
 * Paths MUST start with `${user.id}/` — the question-images INSERT policy
 * keys on the first folder segment being the uploader's uid.
 */
import { supabase } from "@/integrations/supabase/client";

export const QUESTION_IMAGE_BUCKET = "question-images";
const FALLBACK_BUCKET = "exam-pdfs";

function isMissingBucketError(err: { message?: string } | null): boolean {
  return !!err?.message && /bucket not found/i.test(err.message);
}

/**
 * Upload an image and return its public URL.
 * Throws on real failures (auth, RLS, network); only a missing
 * `question-images` bucket triggers the silent fallback.
 */
export async function uploadQuestionImage(
  path: string,
  body: Blob | File,
  contentType = "image/png"
): Promise<string> {
  const first = await supabase.storage
    .from(QUESTION_IMAGE_BUCKET)
    .upload(path, body, { upsert: true, contentType });

  if (!first.error) {
    const { data } = supabase.storage.from(QUESTION_IMAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  if (!isMissingBucketError(first.error)) throw first.error;

  // Storage migration not applied yet — behave exactly like the old code.
  // eslint-disable-next-line no-console
  console.warn(
    "[questionImageUpload] 'question-images' bucket missing — falling back to " +
      `'${FALLBACK_BUCKET}'. Apply the storage migration to fix student-visible images.`
  );
  const second = await supabase.storage
    .from(FALLBACK_BUCKET)
    .upload(path, body, { upsert: true, contentType });
  if (second.error) throw second.error;
  const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
