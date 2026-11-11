import { listTracks, addTrackFile, addSpotify, spotifyLinks, spotifyTitle, removeTrack, spotifyRef, playableUrl, subscribe, MAX_MEDIA_BYTES } from './room-data.js';
import { shortOf } from './who.js';
import { openPanel, closePanel } from './room-panel.js';
import { esc } from './room-kit.js';
import { toast, showPrompt, showConfirm } from './ui.js';
import { reportError } from './errors.js';

/**
 * Our songs, through the speakers on the desks.
 *
 * Two kinds of song:
 *  - uploaded files (mp3, m4a…): played here, full length, and the speakers
 *    pulse to the actual bass of the song
 *  - Spotify links (song, album or playlist): played through Spotify's own
 *    player. Full songs if you're logged in to Spotify in this browser,
 *    30-second previews if you're not. Spotify doesn't let any website play
 *    its music any other way.
 *
 * The player docks in the corner so the music keeps going while you walk
 * around the room.
 */

let api = null;                 // set by installMusic, used by the computers' Music app
export function openMusic(){ api?.openPanel(); }

/** For the computers' sound flyout: what's playing, and the buttons. */
const musicListeners = new Set();
export const music = {
  state: () => api?.state() || null,
  toggle: () => api?.toggle(),
  step: d => api?.step(d),
  setVolume: v => api?.setVolume(v),
  onChange(fn){ musicListeners.add(fn); return () => musicListeners.delete(fn); },
};

export function installMusic(ctx){
  const { THREE, pick, ROOM } = ctx;

  /* ---- the speakers ---- */
  const cones = pick(ROOM.hotspots.speakerCones).map(m => {
    m.material = m.material.clone();
    return { mesh: m, base: m.scale.clone(), emissive: m.material.emissiveIntensity ?? 1 };
  });
  const speakerParts = pick(ROOM.hotspots.speakers);

  /* ---- audio ---- */
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  let actx = null, analyser = null, freq = null;
  function ensureAnalyser(){
    if (actx) { actx.resume?.(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser); analyser.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch(e){ console.warn('no analyser — speakers will pulse on a beat instead', e); }
  }

  /* ---- Spotify ---- */
  let spotifyCtl = null, spotifyReady = null, spotifyPlaying = false, spotifyState = null;
  function loadSpotify(){
    if (spotifyReady) return spotifyReady;
    spotifyReady = new Promise(resolve => {
      window.onSpotifyIframeApiReady = IFrameAPI => resolve(IFrameAPI);
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return spotifyReady;
  }

  /* ---- state ---- */
  let tracks = [];
  let current = null;          // the track playing
  let hidden = false;          // player put away with ✕; the music keeps going
  let volume = Number(localStorage.getItem('ourroom_music_vol') || 0.8);
  audio.volume = volume;

  async function refresh(){
    try { tracks = await listTracks(); }
    catch(e){ if (!e.needsMigration) reportError('music list', e); }
    renderList();
  }
  refresh();
  subscribe('tracks', refresh);

  /* ---- the dock ---- */
  const dock = document.createElement('div');
  dock.className = 'music-dock';
  dock.innerHTML = `
    <div class="md-row">
      <span class="md-disc"></span>
      <div class="md-meta"><span class="md-title"></span><span class="md-artist"></span></div>
      <button class="md-btn md-prev" title="Previous">⏮</button>
      <button class="md-btn md-play" title="Play / pause">⏯</button>
      <button class="md-btn md-next" title="Next">⏭</button>
      <button class="md-btn md-list" title="Our songs">☰</button>
      <button class="md-btn md-min" title="Make it small">▾</button>
      <button class="md-btn md-close" title="Hide the player — the music keeps playing">&times;</button>
    </div>
    <div class="md-seek"><span class="md-fill"></span></div>
    <div class="md-spotify"><div class="md-spotify-host"></div><p class="md-sp-hint"></p></div>`;
  document.getElementById('screen-room').appendChild(dock);
  dock.querySelector('.md-play').addEventListener('click', togglePlay);
  dock.querySelector('.md-next').addEventListener('click', () => step(1));
  dock.querySelector('.md-prev').addEventListener('click', () => step(-1));
  dock.querySelector('.md-list').addEventListener('click', () => showPanel());
  dock.querySelector('.md-min').addEventListener('click', () => {
    const mini = dock.classList.toggle('mini');
    dock.querySelector('.md-min').textContent = mini ? '▴' : '▾';
    dock.querySelector('.md-min').title = mini ? 'Show the player' : 'Make it small';
  });
  dock.querySelector('.md-close').addEventListener('click', () => {
    hidden = true;
    dock.classList.remove('show');
    if (isPlaying()) toast('still playing — click the speakers to get the player back', 3500);
  });
  dock.querySelector('.md-seek').addEventListener('click', e => {
    if (current?.kind !== 'upload' || !audio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  });

  function renderDock(){
    musicListeners.forEach(fn => { try { fn(); } catch(_){} });
    dock.classList.toggle('show', !!current && !hidden);
    if (!current) return;
    dock.classList.toggle('is-spotify', current.kind === 'spotify');
    if (current.kind !== 'spotify') dock.classList.remove('is-list');
    dock.querySelector('.md-title').textContent = current.title || 'Untitled';
    dock.querySelector('.md-artist').textContent = current.artist || (current.kind === 'spotify' ? 'Spotify' : `added by ${shortOf(current.added_by)}`);
    const playing = isPlaying();
    dock.classList.toggle('playing', playing);
    dock.querySelector('.md-play').textContent = playing ? '⏸' : '▶';
  }

  const isPlaying = () => current?.kind === 'spotify' ? spotifyPlaying : !audio.paused;

  /* ---- playing ---- */
  async function play(track){
    if (!track) return;
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'song' }));
    current = track;
    hidden = false;
    if (track.kind === 'upload'){
      if (spotifyCtl) spotifyCtl.pause?.();
      spotifyPlaying = false;
      try {
        const url = await playableUrl(track);
        if (!url) throw new Error('the file is missing');
        ensureAnalyser();
        audio.src = url;
        await audio.play();
      } catch(e){ toast("couldn't play that song"); reportError('music play', e); }
    } else {
      audio.pause();
      const ref = spotifyRef(track.url);
      if (!ref){ toast('that Spotify link is broken'); return; }
      await playSpotify(ref);
    }
    renderDock();
    renderList();
  }

  /**
   * Spotify's player is rebuilt for every link. Reusing one and swapping the
   * link (loadUri) is unreliable going from a single song to a playlist — the
   * player loads the list and then sits at 00:00. A playlist or album gets
   * the tall player with its track list, so a song can be picked in it.
   */
  async function playSpotify(ref){
    const IFrameAPI = await loadSpotify();
    if (!IFrameAPI){ toast("Spotify's player couldn't load — check your connection"); return; }
    try { spotifyCtl?.destroy?.(); } catch(_){}
    spotifyCtl = null; spotifyPlaying = false;
    const host = dock.querySelector('.md-spotify-host');
    host.innerHTML = '<div></div>';
    const isList = ref.type !== 'track' && ref.type !== 'episode';
    dock.classList.add('show', 'is-spotify');
    dock.classList.toggle('is-list', isList);
    dock.classList.remove('mini');
    dock.querySelector('.md-min').textContent = '▾';
    dock.querySelector('.md-sp-hint').textContent = isList
      ? "if it doesn't start, press play or tap a song in the list"
      : '';
    await new Promise(resolve => {
      IFrameAPI.createController(host.firstElementChild,
        { uri: ref.uri, width: '100%', height: isList ? 352 : 80 },
        ctl => {
          spotifyCtl = ctl;
          ctl.addListener('playback_update', e => {
            spotifyState = e.data;
            spotifyPlaying = !e.data.isPaused;
            if (spotifyPlaying) dock.querySelector('.md-sp-hint').textContent = '';
            renderDock();
          });
          ctl.addListener('ready', () => { try { ctl.play(); } catch(_){} });
          resolve();
        });
    });
  }

  function togglePlay(){
    if (!current){ if (tracks.length) play(tracks[0]); return; }
    if (current.kind === 'spotify'){ spotifyCtl?.togglePlay(); return; }
    ensureAnalyser();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function step(dir){
    if (!tracks.length) return;
    const i = tracks.findIndex(t => t.id === current?.id);
    play(tracks[(i + dir + tracks.length) % tracks.length]);
  }

  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('play', renderDock);
  audio.addEventListener('pause', renderDock);
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) dock.querySelector('.md-fill').style.width = (audio.currentTime / audio.duration * 100) + '%';
  });

  /* ---- the list ---- */
  let panelEl = null;
  function showPanel(){
    if (hidden && current){ hidden = false; renderDock(); }
    panelEl = openPanel({
      className: 'music-panel',
      onClose: () => { panelEl = null; },
      html: `
        <p class="rp-eyebrow">through the speakers</p>
        <h2 class="rp-title">Our songs</h2>
        <div class="mp-vol"><span>🔈</span><input type="range" min="0" max="1" step="0.01" value="${volume}"><span>🔊</span></div>
        <div class="mp-list"></div>
        <div class="mp-add">
          <button class="ui-btn primary mp-upload">+ Upload a song</button>
          <button class="ui-btn mp-spotify">+ Spotify link</button>
        </div>
        <p class="mp-note">Uploaded songs play in full and the speakers move to the music.
          Spotify links play full songs if you're logged in to Spotify in this browser, 30-second previews if not.</p>`,
    });
    panelEl.querySelector('.mp-vol input').addEventListener('input', e => {
      volume = Number(e.target.value); audio.volume = volume;
      spotifyCtl?.setVolume?.(volume);
      localStorage.setItem('ourroom_music_vol', String(volume));
    });
    panelEl.querySelector('.mp-upload').addEventListener('click', uploadSong);
    panelEl.querySelector('.mp-spotify').addEventListener('click', addSpotifyLink);
    renderList();
  }

  function renderList(){
    const list = panelEl?.querySelector('.mp-list');
    if (!list) return;
    if (!tracks.length){
      list.innerHTML = '<p class="mp-empty">no songs yet — add the first one</p>';
      return;
    }
    list.innerHTML = '';
    tracks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'mp-track' + (t.id === current?.id ? ' active' : '');
      row.innerHTML = `
        <span class="mp-kind ${t.kind}">${t.kind === 'spotify' ? 'Spotify' : '♪'}</span>
        <div class="mp-meta"><span class="mp-title">${esc(t.title || 'Untitled')}</span>
          <span class="mp-sub">${esc(t.artist || '')}${t.artist ? ' · ' : ''}added by ${esc(shortOf(t.added_by))}</span></div>
        <button class="mp-x" title="Remove">&times;</button>`;
      row.addEventListener('click', e => { if (!e.target.closest('.mp-x')) play(t); });
      row.querySelector('.mp-x').addEventListener('click', async e => {
        e.stopPropagation();
        if (!await showConfirm(`Remove "${t.title}" from our songs?`, 'Remove', 'Remove')) return;
        try {
          if (current?.id === t.id){ audio.pause(); spotifyCtl?.pause?.(); current = null; renderDock(); }
          await removeTrack(t); await refresh();
        } catch(err){ toast(err.message || "couldn't remove it"); }
      });
      list.appendChild(row);
    });
  }

  function uploadSong(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_MEDIA_BYTES){ toast('that file is over 50 MB'); return; }
      const guess = file.name.replace(/\.[^.]+$/, '');
      const [g1, g2] = guess.includes(' - ') ? guess.split(' - ') : [guess, ''];
      const title = await showPrompt('Song title', g2 ? g2.trim() : g1.trim(), 'New song');
      if (title === null) return;
      const artist = await showPrompt('Who sings it?', g2 ? g1.trim() : '', 'New song');
      toast('uploading…', 30000);
      try {
        await addTrackFile(file, title, artist || '');
        window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'song-add' }));
        toast('added to our songs', 2500);
        await refresh();
      } catch(e){
        toast(e.needsMigration ? e.message : (e.message || 'upload failed'), 7000);
        if (!e.needsMigration) reportError('music upload', e);
      }
    });
    input.click();
  }

  /**
   * Paste one Spotify link or many at once — the names come from Spotify, so
   * there's nothing to type. Only if Spotify can't be reached does it ask.
   */
  async function addSpotifyLink(){
    const text = await showPrompt('Paste Spotify links — one, or several at once (Share → Copy link to song / playlist / album). The names fill in by themselves.', '', 'Spotify');
    if (!text) return;
    const links = spotifyLinks(text);
    if (!links.length){ toast("that doesn't look like a Spotify link"); return; }
    toast(links.length === 1 ? 'getting the name from Spotify…' : `getting ${links.length} names from Spotify…`, 2500);
    const names = await Promise.all(links.map(l => spotifyTitle(l.url)));
    let added = 0;
    for (let i = 0; i < links.length; i++){
      let title = names[i];
      if (!title){
        // Spotify didn't answer: ask, but only for this one
        title = await showPrompt(`Couldn't get the name from Spotify. What should we call this ${links[i].type}?`, links[i].type === 'track' ? 'our song' : 'our playlist', 'Spotify');
        if (title === null) continue;
      }
      try { await addSpotify(links[i].url, title); added++; window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'song-add' })); }
      catch(e){ toast(e.needsMigration ? e.message : (e.message || "couldn't add it"), 7000); if (!e.needsMigration) reportError('music spotify', e); break; }
    }
    if (added){
      await refresh();
      toast(added === 1 ? `added "${names.find(Boolean) || 'it'}"` : `added ${added} songs`, 2500);
    }
  }

  api = {
    openPanel: showPanel,
    state: () => ({
      title: current?.title || null, artist: current?.artist || (current?.kind === 'spotify' ? 'Spotify' : ''),
      playing: isPlaying(), hasTracks: tracks.length > 0, volume,
    }),
    toggle: togglePlay,
    step,
    setVolume(v){
      volume = v; audio.volume = v;
      spotifyCtl?.setVolume?.(v);
      try { localStorage.setItem('ourroom_music_vol', String(v)); } catch(_){}
      const r = panelEl?.querySelector('.mp-vol input'); if (r) r.value = v;
    },
  };

  /* ---- the speakers, every frame ---- */
  let level = 0;
  return {
    key: 'speakers',
    objects: speakerParts,
    label: () => current && isPlaying()
      ? { label: 'Now playing', sub: current.title || 'our song' }
      : { label: 'The speakers', sub: 'our songs' },
    click: () => showPanel(),
    update(t, dt){
      let target = 0;
      if (current?.kind === 'upload' && !audio.paused && analyser){
        analyser.getByteFrequencyData(freq);
        let bass = 0;
        for (let i = 1; i < 12; i++) bass += freq[i];
        target = Math.min(1, (bass / 11 / 255) ** 1.25 * 2.4);
      } else if (isPlaying()){
        // Spotify won't share its audio, so the speakers keep a steady beat
        const beat = (t * 112 / 60) % 1;
        target = Math.exp(-beat * 6) * 0.8;
      }
      level += (target - level) * (1 - Math.exp(-dt * 18));
      for (const c of cones){
        c.mesh.scale.copy(c.base).multiplyScalar(1 + level * 0.18);
        if ('emissiveIntensity' in c.mesh.material) c.mesh.material.emissiveIntensity = c.emissive * (1 + level * 2.5);
      }
    },
  };
}