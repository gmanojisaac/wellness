'use client';
import React, { useEffect, useRef, useState } from 'react';

// "Listen to program preview" toggle on the program overview pages.
export default function ListenButton({ src, programName }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'none';
    audioRef.current = audio;

    const stop = () => {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    };
    const onEnded = () => {
      setPlaying(false);
      setStatus('Audio preview finished.');
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        stop();
        setStatus('');
      }
    };

    audio.addEventListener('ended', onEnded);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', stop);
    return () => {
      audio.removeEventListener('ended', onEnded);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', stop);
      audio.pause();
    };
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      setStatus('');
      return;
    }
    setPlaying(true);
    try {
      await audio.play();
      setStatus(`${programName} preview playing.`);
    } catch {
      setPlaying(false);
      setStatus(`${programName} audio could not play.`);
    }
  };

  return (
    <>
      <button className="listen-button" type="button" aria-pressed={playing} onClick={toggle}>
        {playing ? 'Stop audio preview' : 'Listen to program preview'}
      </button>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </>
  );
}
