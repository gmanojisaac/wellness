'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { getLiveToken } from '../../../../../lib/studentApi';
import { formatSessionTime } from '../../../../../lib/lifecycle';

// Live class. The server only issues a token to a signed-in learner of this session's
// cohort, inside the join window; the token stops working when the window closes.
export default function LiveClassPage() {
  const { sessionId } = useParams();
  const router = useRouter();
  const [join, setJoin] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    getLiveToken(sessionId).then(setJoin).catch((err) => setProblem({
      message: err.message,
      reason: err.data?.reason,
      opensAt: err.data?.opensAt,
    }));
  }, [sessionId]);

  if (problem) {
    return (
      <div className="sp-narrow-block">
        <div className="sp-card sp-login">
          <span className="eyebrow">LIVE CLASS</span>
          <h1>{problem.reason === 'not_open' ? 'Not open yet' : problem.reason === 'closed' ? 'Class has ended' : 'Cannot join'}</h1>
          <p className="sp-muted">
            {problem.reason === 'not_open' && problem.opensAt
              ? `The classroom opens at ${formatSessionTime(problem.opensAt)}.`
              : problem.message}
          </p>
          <Link href="/student" className="register-button sp-block">Return to dashboard</Link>
        </div>
      </div>
    );
  }

  if (!join) return <p className="sp-muted sp-loading" role="status">Checking your class access…</p>;

  const { session } = join;
  return (
    <div className="sp-live">
      <div className="sp-live-head">
        <div>
          <span className="eyebrow">LIVE CLASS · {session.cohortCode}</span>
          <h1>Week {session.weekNumber}{session.weekTitle ? `: ${session.weekTitle}` : ''}</h1>
        </div>
        <p className="sp-muted sp-small">Camera is optional. This space is for learning, not emergency support.</p>
      </div>
      <LiveKitRoom
        className="sp-live-room"
        data-lk-theme="default"
        serverUrl={join.serverUrl}
        token={join.token}
        connect
        audio={false}
        video={false}
        onDisconnected={() => router.push('/student')}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
