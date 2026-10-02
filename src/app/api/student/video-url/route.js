import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';

const VIDEO_BUCKET = 'class-videos';
const SIGNED_URL_SECONDS = 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns a playable URL for a class video the signed-in student is allowed to watch.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }
  if (typeof body.videoId !== 'string' || !UUID_RE.test(body.videoId)) {
    return NextResponse.json({ error: 'A valid videoId is required.' }, { status: 400 });
  }

  try {
    // student_video_source() checks enrolment, publication and release as the caller
    const session = await createSessionClient();
    const { data: source, error } = await session.rpc('student_video_source', { p_video_id: body.videoId });
    if (error) {
      const status = error.code === '42501' || error.code?.startsWith('PGRST3') ? 403 : 500;
      return NextResponse.json({ error: 'This video is not available.' }, { status });
    }

    if (source.source_type === 'link') {
      return NextResponse.json({ sourceType: 'link', url: source.url });
    }

    // The bucket is private; only this server can mint a short-lived link to the file
    const { data, error: signError } = await createServiceClient()
      .storage.from(VIDEO_BUCKET).createSignedUrl(source.storage_path, SIGNED_URL_SECONDS);
    if (signError) throw signError;
    return NextResponse.json({ sourceType: 'upload', url: data.signedUrl });
  } catch (error) {
    console.error('[api/student/video-url] Failed:', error.message || error);
    return NextResponse.json({ error: 'The video could not be loaded. Please try again.' }, { status: 500 });
  }
}
