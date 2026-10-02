'use client';
import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PROGRAM_PAGES } from '../../lib/programPages';
import { initLandingPlayback } from './landingPlayback';

export default function EverydayLanding() {
  const rootRef = useRef(null);

  useEffect(() => initLandingPlayback(rootRef.current, PROGRAM_PAGES), []);

  return (
    <div ref={rootRef} className="everyday landing">
      <a className="skip" href="#main">Skip to content</a>

      <header className="landing-header">
        <Link href="/student" className="landing-login">Student login</Link>
        <Link href="/register" className="register-button">Register</Link>
      </header>

      <main id="main" className="tiles-hidden" tabIndex={-1}>
        <h1 className="sr-only">Everyday adult mental-wellness learning program</h1>
        <div className="media-stage">
          <section className="hero" aria-label="Program introduction">
            <div className="hero-frame">
              <video
                controls
                playsInline
                preload="auto"
                poster="/everyday/hero-poster.webp"
                aria-label="Everyday mental wellness introduction video"
              >
                <source src="/everyday/hero-mobile.mp4" type="video/mp4" media="(max-width: 600px)" />
                <source src="/everyday/hero.mp4" type="video/mp4" />
                Your browser does not support this video.
              </video>

              <button className="hero-unmute" type="button" aria-label="Unmute video and enable audio previews" hidden>
                <span className="hero-unmute-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4 6 6m0-6-6 6" /></svg>
                </span>
                <span className="hero-unmute-label">Unmute video</span>
              </button>

              <div className="hero-controls" hidden>
                <button data-hero-play className="hero-control" type="button" aria-label="Pause video" title="Pause video">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="pause-icon" d="M8 5v14M16 5v14" />
                    <path className="play-icon" d="m7 4 13 8-13 8Z" />
                  </svg>
                </button>
                <button data-hero-sound className="hero-control" type="button" aria-label="Unmute video" title="Unmute video">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                    <path className="muted-icon" d="m15 9 6 6m0-6-6 6" />
                    <path className="sound-icon" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
                  </svg>
                </button>
              </div>

              <div className="register-overlay" hidden>
                <div className="register-overlay-content">
                  <span className="eyebrow">READY TO BEGIN?</span>
                  <h2>Register for your program</h2>
                  <p>Choose the path that fits you and reserve your place.</p>
                  <div className="register-overlay-actions">
                    <Link href="/register" className="register-button">Register now</Link>
                    <button className="replay-button" type="button">Watch again</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="programs" id="programs" aria-labelledby="program-title">
            <h2 id="program-title" className="sr-only">Choose your program</h2>
            <div className="card-grid">
              {PROGRAM_PAGES.map((program) => (
                <article key={program.slug} className={`program-card ${program.accent}`} data-program={program.slug}>
                  <Link
                    className="card-link"
                    href={`/programs/${program.slug}`}
                    aria-labelledby={`${program.slug}-title ${program.slug}-duration`}
                    aria-describedby={`${program.slug}-description`}
                  >
                    <div className="card-image">
                      <Image
                        src={program.image}
                        alt={program.imageAlt}
                        width={1600}
                        height={1195}
                        sizes="(max-width: 600px) 78vw, (max-width: 1020px) 50vw, 23vw"
                      />
                      <span className="duration" id={`${program.slug}-duration`}>{program.duration}</span>
                    </div>
                    <div className="card-copy">
                      <h3 id={`${program.slug}-title`}>{program.title}</h3>
                      <p id={`${program.slug}-description`}>{program.cardDescription}</p>
                    </div>
                  </Link>
                  <button
                    className="speaker"
                    type="button"
                    data-preview={program.slug}
                    aria-label={`Play ${program.title} audio preview`}
                    aria-pressed="false"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                      <path className="speaker-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
                      <path className="speaker-muted" d="m16 9 5 6m0-6-5 6" />
                    </svg>
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      <p className="sr-only" role="status" aria-live="polite" />
    </div>
  );
}
