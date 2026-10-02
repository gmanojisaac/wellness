// Playback choreography for the landing page: the hero video plays muted, the program
// tiles fade in over its last moments, and when it ends the register overlay appears
// while each tile is highlighted in turn (with its voice preview if sound is on).
// Drives the DOM rendered by EverydayLanding directly; returns a cleanup function.

const HERO_SRC = '/everyday/hero.mp4';
const HERO_MOBILE_SRC = '/everyday/hero-mobile.mp4';
const TILE_REVEAL_SECONDS = 1.5;
const SILENT_TILE_MS = 5000;
const HOVER_DELAY_MS = 400;

export function initLandingPlayback(root, programs) {
  const listeners = new AbortController();
  const { signal } = listeners;

  const names = Object.fromEntries(programs.map((program) => [program.slug, program.title]));
  const audio = Object.fromEntries(programs.map((program) => {
    const preview = new Audio(program.audio);
    preview.preload = 'none';
    return [program.slug, preview];
  }));

  const main = root.querySelector('main');
  const hero = root.querySelector('video');
  const heroUnmute = root.querySelector('.hero-unmute');
  const heroUnmuteLabel = root.querySelector('.hero-unmute-label');
  const heroControls = root.querySelector('.hero-controls');
  const heroPlayToggle = root.querySelector('[data-hero-play]');
  const heroSoundToggle = root.querySelector('[data-hero-sound]');
  const overlay = root.querySelector('.register-overlay');
  const replay = root.querySelector('.replay-button');
  const status = root.querySelector('[role="status"]');
  const buttons = root.querySelectorAll('[data-preview]');
  const cards = root.querySelectorAll('[data-program]');

  // Arriving via "Our programs" (/#programs) shows the tiles straight away.
  const pinTiles = window.location.hash === '#programs';

  let enabled = false;
  let active = null;
  let timer = null;
  let generation = 0;
  let sequence = null;
  let sequenceIndex = -1;
  let sequenceTimer = null;
  let sequenceAudio = false;
  let singleTileAudio = false;
  let audioPlaying = false;
  let tilesRevealed = false;
  let heroWasPlayingBeforeHide = false;

  function announce(text) {
    status.textContent = text;
  }

  function refreshTileVisibility() {
    if (!Number.isFinite(hero.duration)) return;
    tilesRevealed = hero.currentTime >= Math.max(hero.duration - TILE_REVEAL_SECONDS, 0);
    main.classList.toggle('tiles-hidden', !pinTiles && !tilesRevealed);
    refreshHero();
  }

  function refreshHero() {
    const mutedPlaying = hero.muted && !hero.paused;
    heroPlayToggle.hidden = !hero.paused;
    heroSoundToggle.hidden = tilesRevealed || mutedPlaying;
    heroUnmute.hidden = !mutedPlaying;
    const label = hero.paused ? 'Play video with sound' : 'Unmute video';
    heroUnmuteLabel.textContent = label;
    heroUnmute.setAttribute('aria-label', `${label} and enable audio previews`);
    heroPlayToggle.dataset.playing = String(!hero.paused);
    heroPlayToggle.setAttribute('aria-label', hero.paused ? 'Play video' : 'Pause video');
    heroPlayToggle.title = hero.paused ? 'Play video' : 'Pause video';
    heroSoundToggle.dataset.muted = String(hero.muted);
    heroSoundToggle.setAttribute('aria-label', hero.muted ? 'Unmute video' : 'Mute video');
    heroSoundToggle.title = hero.muted ? 'Unmute video' : 'Mute video';
  }

  function refresh() {
    buttons.forEach((button) => {
      const playing = button.dataset.preview === active && audioPlaying;
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', `${playing ? 'Stop' : 'Play'} ${names[button.dataset.preview]} audio preview`);
    });
    cards.forEach((card) => card.classList.toggle('is-playing', card.dataset.program === active));
    refreshHero();
  }

  function cancelHover() {
    clearTimeout(timer);
    timer = null;
  }

  function stop(preserveSequence = false) {
    cancelHover();
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
    generation++;
    if (!preserveSequence) {
      sequence = null;
      sequenceIndex = -1;
      sequenceAudio = false;
      singleTileAudio = false;
    }
    Object.values(audio).forEach((preview) => {
      preview.pause();
      preview.currentTime = 0;
    });
    active = null;
    audioPlaying = false;
    refresh();
    announce('');
  }

  function showSilentFallback(id) {
    announce(`${names[id]} audio could not play. Showing its tile silently for 5 seconds.`);
    if (sequenceTimer !== null) return;
    audioPlaying = false;
    refresh();
    sequenceTimer = setTimeout(() => {
      sequenceTimer = null;
      if (active !== id) return;
      if (sequence) {
        if (singleTileAudio) {
          singleTileAudio = false;
          sequenceAudio = false;
        }
        advanceProgramSequence();
      } else stop();
    }, SILENT_TILE_MS);
  }

  function showMutedTile(id) {
    stop(true);
    hero.muted = true;
    active = id;
    audioPlaying = false;
    refresh();
    announce(`${names[id]} audio muted.`);
  }

  function scrollProgramToStart(id) {
    const card = [...cards].find((item) => item.dataset.program === id);
    const grid = card?.parentElement;
    if (!card || !grid) return;
    if (!window.matchMedia('(max-width: 600px)').matches) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      return;
    }
    grid.scrollTo({
      left: grid.scrollLeft + card.getBoundingClientRect().left - grid.getBoundingClientRect().left,
      behavior: 'smooth',
    });
  }

  function advanceProgramSequence() {
    if (!sequence) return;
    sequenceIndex++;
    if (sequenceIndex >= sequence.length) {
      const firstTile = sequence[0];
      stop();
      scrollProgramToStart(firstTile);
      announce('Program previews finished.');
      return;
    }
    const id = sequence[sequenceIndex];
    scrollProgramToStart(id);
    if (sequenceAudio) {
      void play(id, true);
    } else {
      showMutedTile(id);
      sequenceTimer = setTimeout(() => {
        sequenceTimer = null;
        if (active === id) advanceProgramSequence();
      }, SILENT_TILE_MS);
    }
  }

  // Tiles are reordered visually with CSS `order`, so follow that rather than DOM order.
  function orderedTileIds() {
    return [...cards]
      .sort((left, right) => Number(getComputedStyle(left).order) - Number(getComputedStyle(right).order))
      .map((card) => card.dataset.program);
  }

  function startTileSequence(id, playAudio, playOnlyThisTile = false) {
    if (!sequence) sequence = orderedTileIds();
    const index = sequence.indexOf(id);
    if (index < 0) return false;
    sequenceAudio = playAudio;
    singleTileAudio = playAudio && playOnlyThisTile;
    sequenceIndex = index - 1;
    stop(true);
    hero.muted = true;
    advanceProgramSequence();
    return true;
  }

  function startProgramSequence(playAudio) {
    sequence = orderedTileIds();
    sequenceIndex = -1;
    sequenceAudio = playAudio;
    singleTileAudio = false;
    hero.muted = true;
    advanceProgramSequence();
  }

  function startTileAudioSequence() {
    if (!sequence || sequenceAudio) return false;
    return startTileSequence(sequence[0], true);
  }

  async function play(id, preserveSequence = false) {
    stop(preserveSequence);
    const token = generation;
    // Keep the cinematic video moving, but give the preview exclusive use of sound.
    hero.muted = true;
    active = id;
    audioPlaying = true;
    refresh();
    try {
      await audio[id].play();
      // stop() already cancels old playback. A stale promise must not pause a newer one.
      if (generation !== token) return;
      announce(`${names[id]} preview playing.`);
    } catch {
      if (generation !== token) return;
      audioPlaying = false;
      refresh();
      showSilentFallback(id);
    }
  }

  async function restartHero(muted) {
    stop();
    hero.currentTime = 0;
    hero.muted = muted;
    try {
      await hero.play();
    } catch {
      if (!muted) {
        hero.muted = true;
        try {
          await hero.play();
        } catch {
          announce('The video could not play. Use the play button to try again.');
        }
      } else announce('The video could not play. Use the play button to try again.');
    }
    refreshHero();
  }

  function resetPlaybackToStart() {
    stop();
    heroWasPlayingBeforeHide = false;
    hero.currentTime = 0;
    scrollProgramToStart(orderedTileIds()[0]);
    refreshTileVisibility();
    void restartHero(false);
  }

  const mobileHeroQuery = window.matchMedia('(max-width: 600px)');

  function updateHeroSource() {
    const source = mobileHeroQuery.matches ? HERO_MOBILE_SRC : HERO_SRC;
    if (hero.currentSrc && new URL(hero.currentSrc).pathname === source) return;
    hero.src = source;
    hero.load();
  }

  async function unmuteHero() {
    const moveFocus = document.activeElement === heroUnmute;
    enabled = true;
    if (startTileAudioSequence()) return;
    await restartHero(false);
    if (moveFocus && heroUnmute.hidden) heroSoundToggle.focus({ preventScroll: true });
  }

  async function autoplayHeroMuted() {
    hero.currentTime = 0;
    hero.muted = true;
    try {
      await hero.play();
    } catch {
      // Autoplay blocked: refreshHero() below leaves the play button showing.
    }
    refreshHero();
  }

  buttons.forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.preview;
    if (active === id && audioPlaying) {
      startTileSequence(id, false);
      return;
    }
    enabled = true;
    if (sequence) startTileSequence(id, true, true);
    else void play(id);
  }, { signal }));

  cards.forEach((card) => {
    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse' || !enabled) return;
      cancelHover();
      timer = setTimeout(() => void play(card.dataset.program), HOVER_DELAY_MS);
    }, { signal });
    card.addEventListener('pointerleave', (event) => {
      // Touch pointers leave on finger-up; keep an explicitly tapped preview playing.
      if (event.pointerType !== 'mouse') return;
      cancelHover();
      if (active === card.dataset.program) stop();
    }, { signal });
    card.addEventListener('focusout', (event) => {
      if (card.contains(event.relatedTarget)) return;
      cancelHover();
      if (active === card.dataset.program) stop();
    }, { signal });
    card.querySelector('.card-link')?.addEventListener('click', () => stop(), { signal });
  });

  Object.entries(audio).forEach(([id, preview]) => {
    preview.addEventListener('ended', () => {
      if (active !== id) return;
      if (sequence) {
        if (sequenceAudio) {
          if (singleTileAudio) {
            singleTileAudio = false;
            sequenceAudio = false;
          }
          advanceProgramSequence();
        }
        return;
      }
      stop();
      announce('Audio preview finished.');
    }, { signal });
    preview.addEventListener('error', () => {
      if (active !== id) return;
      showSilentFallback(id);
    }, { signal });
  });

  main.classList.toggle('tiles-hidden', !pinTiles);
  hero.autoplay = false;
  updateHeroSource();
  mobileHeroQuery.addEventListener('change', () => {
    const wasPlaying = !hero.paused;
    updateHeroSource();
    if (wasPlaying) void hero.play().catch(refreshHero);
  }, { signal });

  heroUnmute.addEventListener('click', () => void unmuteHero(), { signal });
  heroSoundToggle.addEventListener('click', () => {
    if (hero.muted) void unmuteHero();
    else {
      hero.muted = true;
      refreshHero();
    }
  }, { signal });
  heroPlayToggle.addEventListener('click', () => {
    if (hero.paused) {
      enabled = true;
      void restartHero(false);
    } else resetPlaybackToStart();
  }, { signal });
  replay.addEventListener('click', () => {
    main.focus({ preventScroll: true });
    void restartHero(hero.muted);
  }, { signal });

  hero.addEventListener('play', () => {
    overlay.hidden = true;
    if (!hero.muted) stop();
    refreshTileVisibility();
    refreshHero();
  }, { signal });
  hero.addEventListener('pause', refreshHero, { signal });
  hero.addEventListener('ended', () => {
    heroWasPlayingBeforeHide = false;
    overlay.hidden = false;
    refreshTileVisibility();
    startProgramSequence(!hero.muted);
    refreshHero();
  }, { signal });
  hero.addEventListener('loadedmetadata', refreshTileVisibility, { signal });
  hero.addEventListener('timeupdate', refreshTileVisibility, { signal });
  hero.addEventListener('volumechange', () => {
    if (!hero.muted && (active !== null || timer !== null)) stop();
    refreshHero();
  }, { signal });

  // Native controls remain available if JavaScript is unavailable.
  hero.controls = false;
  heroControls.hidden = false;
  refreshHero();
  void autoplayHeroMuted();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') stop();
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      heroWasPlayingBeforeHide = !hero.paused && !hero.ended;
      return;
    }
    const shouldResume = heroWasPlayingBeforeHide;
    heroWasPlayingBeforeHide = false;
    if (shouldResume && hero.paused && !hero.ended && active === null) {
      void hero.play().catch(refreshHero);
    }
    refreshHero();
  }, { signal });
  window.addEventListener('pagehide', () => stop(), { signal });

  return () => {
    listeners.abort();
    stop();
    hero.pause();
  };
}
