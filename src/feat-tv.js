import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { listVideos, addVideoFile, addYouTube, removeVideo, youTubeId, playableUrl, subscribe, listFrames, MAX_MEDIA_BYTES } from './room-data.js';
import { getPcFolders, ensurePhotoSrc } from './books.js';
import { quadInfo, fillQuadUV, frontView, loadImage, esc } from './room-kit.js';
import { toast, showPrompt, showConfirm } from './ui.js';
import { reportError } from './errors.js';
import { loadShared, getShared, setShared, onShared, send, onMessage, bothHere, onHere } from './room-live.js';
import { getMe, shortOf, other } from './who.js';

const SLIDE_SECONDS = 8;
const FADE_SECONDS = 1.4;

/**
 * A real TV.
 *
 * Photos and uploaded videos are painted straight onto the 3D screen.
 * YouTube won't hand over its pixels for that, so a YouTube channel puts the
 * real YouTube player *inside the room*: a CSS 3D layer behind the canvas,
 * angled exactly like the screen, with a hole cut in the screen so it shows
 * through. It keeps playing — with sound — while you walk around, like a TV
 * left on in the living room.
 *
 * The remote: sit down at the TV and it opens; collapse it to a small bar any
 * time. Back in the room it stays as a small bar so you can pause or mute
 * without walking over.
 */
export function installTv(ctx){
  const { THREE, scene, one, roomCenter, camera, renderer, focusTo, goBack, onBack, nightAmount, ROOM } = ctx;
  const screen = one(ROOM.hotspots.tvScreen);
  if (!screen) return null;
  const body = ROOM.hotspots.tv.map(one).filter(Boolean);

  const info = quadInfo(screen, roomCenter);
  fillQuadUV(screen, info);

  /* ---- the picture on the glass ---- */
  const W = 1024, H = Math.round(W / info.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const canvasTex = new THREE.CanvasTexture(canvas);
  canvasTex.colorSpace = THREE.SRGBColorSpace;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto';
  const videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: canvasTex, toneMapped: false, color: 0xffffff });
  // a see-through hole: writes alpha 0 so the YouTube layer behind the canvas shows
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  screen.material = mat;

  /* ---- the glow the screen throws into the room ----
     A soft panel light the size of the screen, facing out (lights the rug,
     table and sofa in front of it), plus a wider point light for the walls.
     Both take their colour from whatever is on the screen right now. */
  RectAreaLightUniformsLib.init();
  const panel = new THREE.RectAreaLight(0xbfd8ff, 0, info.width * 1.05, info.height * 1.05);
  panel.position.copy(info.center).addScaledVector(info.normal, 0.03);
  panel.lookAt(info.center.clone().addScaledVector(info.normal, 2));
  scene.add(panel);
  const light = new THREE.PointLight(0xbfd8ff, 0, 7, 1.6);
  light.position.copy(info.center).addScaledVector(info.normal, 0.7);
  scene.add(light);

  // read the average colour of the picture a few times a second
  const probe = document.createElement('canvas');
  probe.width = 16; probe.height = 9;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  const glow = new THREE.Color(0xbfd8ff);          // where the light is now
  const glowTarget = new THREE.Color(0xbfd8ff);    // what the picture says
  let glowBright = 0.8, glowBrightTarget = 0.8;
  let probeT = 0, videoTainted = false;
  function sampleScreen(source){
    try {
      pg.drawImage(source, 0, 0, 16, 9);
      const d = pg.getImageData(0, 0, 16, 9).data;
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4){ r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      r /= n * 255; gg /= n * 255; b /= n * 255;
      const luma = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      glowBrightTarget = Math.min(1, 0.3 + luma * 1.6);
      // keep the hue, lift it so a dark scene still reads as coloured light
      const m = Math.max(r, gg, b, 0.001);
      glowTarget.setRGB(0.55 + 0.45 * r / m, 0.55 + 0.45 * gg / m, 0.55 + 0.45 * b / m, THREE.SRGBColorSpace);
      return true;
    } catch(_){ return false; }       // a video from another site won't let us read it
  }

  /* ---- the YouTube layer, placed exactly on the screen ---- */
  const css = new CSS3DRenderer();
  css.setSize(innerWidth, innerHeight);
  css.domElement.className = 'tv-css3d';
  renderer.domElement.parentElement.insertBefore(css.domElement, renderer.domElement);
  const cssScene = new THREE.Scene();
  const PX_W = 1280, PX_H = Math.round(PX_W / info.aspect);
  const holder = document.createElement('div');
  holder.className = 'tv-yt';
  holder.style.width = PX_W + 'px';
  holder.style.height = PX_H + 'px';
  const ytObj = new CSS3DObject(holder);
  ytObj.position.copy(info.center);
  ytObj.lookAt(info.center.clone().add(info.normal));
  ytObj.scale.setScalar(info.width / PX_W);
  cssScene.add(ytObj);
  addEventListener('resize', () => css.setSize(innerWidth, innerHeight));

  /* ---- state ---- */
  const SAVED = 'ourroom_tv';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED)) || {}; } catch(_){ return {}; } })();
  let on = saved.on !== false;
  let channelId = saved.channel || 'photos';
  let volume = typeof saved.volume === 'number' ? saved.volume : 0.7;
  let muted = true;            // the browser won't allow sound until you sit down once
  let paused = false;
  let videos = [];
  let slides = [];
  let slideIdx = 0, slideT = 0;
  let watching = false;
  let dismissed = saved.dismissed === true;   // remote put away; click the TV to get it back
  let ytFrame = null, ytId = null;
  const persist = () => localStorage.setItem(SAVED, JSON.stringify({ on, channel: channelId, volume, dismissed }));

  const channels = () => [{ id: 'photos', title: 'Our photos', kind: 'photos' }, ...videos];
  const channel = () => channels().find(c => c.id === channelId) || channels()[0];
  const hasSound = () => on && (channel().kind === 'upload' || channel().kind === 'youtube');

  /* ---- photos for the slideshow ---- */
  async function loadSlides(){
    const srcs = [];
    try {
      const frames = await listFrames();
      Object.values(frames).forEach(u => u && srcs.push(u));
    } catch(_){}
    for (const owner of ['andrei', 'cherryl']){
      for (const f of getPcFolders(owner)) for (const ph of f.photos){
        try { const s = await ensurePhotoSrc(ph); if (s) srcs.push(s); } catch(_){}
      }
    }
    const shuffled = srcs.sort(() => Math.random() - 0.5).slice(0, 40);
    const imgs = [];
    for (const s of shuffled){
      try { imgs.push(await loadImage(s)); } catch(_){}
      if (imgs.length === 2 && !slides.length) slides = imgs.slice();   // start showing early
    }
    slides = imgs;
  }

  /* ---- drawing ---- */
  function cover(img, zoom, panX, panY, alpha){
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * s, dh = ih * s;
    g.globalAlpha = alpha;
    g.drawImage(img, (W - dw) / 2 + panX * (dw - W) / 2, (H - dh) / 2 + panY * (dh - H) / 2, dw, dh);
    g.globalAlpha = 1;
  }

  function drawSlides(dt){
    if (!slides.length){ drawIdle(); return; }
    slideT += dt;
    if (slideT > SLIDE_SECONDS){ slideT -= SLIDE_SECONDS; slideIdx = (slideIdx + 1) % slides.length; }
    const kb = (i, t) => {                                   // a slow Ken Burns drift
      const dir = i % 2 ? 1 : -1;
      return [1.06 + 0.1 * (t / SLIDE_SECONDS), dir * (t / SLIDE_SECONDS - 0.5) * 0.8, (i % 3 - 1) * 0.3];
    };
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const cur = slides[slideIdx];
    const [z, px, py] = kb(slideIdx, slideT);
    cover(cur, z, px, py, 1);
    const fadeStart = SLIDE_SECONDS - FADE_SECONDS;
    if (slideT > fadeStart && slides.length > 1){
      const nIdx = (slideIdx + 1) % slides.length;
      const a = (slideT - fadeStart) / FADE_SECONDS;
      const [z2, px2, py2] = kb(nIdx, 0);
      cover(slides[nIdx], z2, px2, py2, a * a * (3 - 2 * a));
    }
    vignette();
  }

  function drawIdle(){
    const t = performance.now() / 1000;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#2a1d2e'); grad.addColorStop(1, '#16202e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const r = g.createRadialGradient(W * (0.5 + Math.sin(t * 0.2) * 0.25), H * (0.5 + Math.cos(t * 0.17) * 0.2), 0, W / 2, H / 2, W * 0.6);
    r.addColorStop(0, 'rgba(255,170,120,.35)'); r.addColorStop(1, 'rgba(255,170,120,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,240,220,.85)';
    g.font = `italic 400 ${Math.round(H * 0.11)}px "Playfair Display", Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('our room', W / 2, H * 0.46);
    g.font = `500 ${Math.round(H * 0.04)}px Inter, system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,240,220,.5)';
    g.fillText('add photos on the computers, or a video here', W / 2, H * 0.6);
  }

  function drawOff(){
    // a dark glass with a faint reflection
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0d0f12'); grad.addColorStop(0.45, '#15181d'); grad.addColorStop(0.5, '#0b0c0e'); grad.addColorStop(1, '#060708');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }

  function vignette(){
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }


  /* ---- YouTube: start, and talk to the player ---- */
  function ytCmd(func, args = []){
    try { ytFrame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch(_){}
  }
  /* where the picture is, for watching together */
  let ytTime = 0, ytAt = 0, ytPlaying = false;
  window.addEventListener('message', e => {
    if (!ytFrame || e.source !== ytFrame.contentWindow) return;
    let d = e.data;
    try { if (typeof d === 'string') d = JSON.parse(d); } catch(_){ return; }
    const info = d && d.info;
    if (!info) return;
    if (typeof info.currentTime === 'number'){ ytTime = info.currentTime; ytAt = performance.now(); }
    if (typeof info.playerState === 'number') ytPlaying = info.playerState === 1;
  });
  function position(){
    const k = channel().kind;
    if (k === 'upload') return video.currentTime || 0;
    if (k === 'youtube') return ytTime + (ytPlaying && ytAt ? (performance.now() - ytAt) / 1000 : 0);
    return 0;
  }
  function seek(t){
    const k = channel().kind;
    if (k === 'upload' && isFinite(t)){ try { video.currentTime = Math.max(0, t); } catch(_){} }
    if (k === 'youtube') ytCmd('seekTo', [Math.max(0, t), true]);
  }

  function applyYtSound(){
    if (!ytFrame) return;
    if (muted || volume === 0) ytCmd('mute');
    else { ytCmd('unMute'); ytCmd('setVolume', [Math.round(volume * 100)]); }
  }
  function showYouTube(id){
    if (ytId === id && ytFrame) return;
    holder.innerHTML = '';
    ytId = id;
    ytFrame = document.createElement('iframe');
    ytFrame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    ytFrame.src = `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&autoplay=1&mute=1&loop=1&playlist=${id}`
      + `&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}`;
    ytFrame.addEventListener('load', () => {
      // ask the player to report where it is, for watching together
      try { ytFrame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'tv', channel: 'widget' }), '*'); } catch(_){}
      // the player needs a moment after load before it takes commands
      setTimeout(() => {
        applyYtSound(); if (paused) ytCmd('pauseVideo');
        if (pendingSeek != null){ seek(pendingSeek); pendingSeek = null; }
      }, 900);
    });
    holder.appendChild(ytFrame);
  }
  function hideYouTube(){
    holder.innerHTML = '';
    ytFrame = null; ytId = null;
  }

  /* ---- switching what's on ---- */
  let pendingSeek = null;
  /** Tell the other screen (and remember for next time) what the TV is doing. */
  function share(){
    setShared('tv', { on, channel: channelId, paused, t: position(), at: Date.now(), by: getMe() });
  }

  async function tune(id, { remote = false } = {}){
    channelId = id;
    const c = channel();
    channelId = c.id;
    persist();
    paused = false;
    if (on && c.kind === 'upload'){
      try {
        const url = await playableUrl(c);
        if (!url) throw new Error('missing file');
        if (video.dataset.src !== url){ video.src = url; video.dataset.src = url; }
        video.muted = muted; video.volume = volume;
        await video.play().catch(() => {});
      } catch(e){ toast("couldn't play that video"); reportError('tv video', e); }
    } else {
      video.pause();
    }
    if (on && c.kind === 'youtube'){
      const id = youTubeId(c.url);
      if (id) showYouTube(id);
    } else hideYouTube();
    renderRemote();
    if (!remote) share();
  }

  function setPaused(p, { remote = false } = {}){
    paused = p;
    const k = channel().kind;
    if (k === 'upload'){ if (paused) video.pause(); else video.play().catch(() => {}); }
    if (k === 'youtube') ytCmd(paused ? 'pauseVideo' : 'playVideo');
    renderRemote();
    if (!remote){
      share();
      send('tv', { action: paused ? 'pause' : 'play', t: position(), channel: channelId });
    }
  }

  /* ---- watching together ---- */
  async function applyShared(v, by){
    if (!v) return;
    const wantOn = v.on !== false, wantCh = v.channel || 'photos';
    if (wantOn !== on || wantCh !== channelId){
      on = wantOn; channelId = wantCh; persist();
      if (!channels().some(c => c.id === wantCh)) await refreshVideos();
      await tune(wantCh, { remote: true });
      if (by && by !== getMe()) toast(`${shortOf(by)} ${on ? `put on ${channel().title || 'our photos'}` : 'turned the TV off'}`, 2600);
      // catch up to where it is for them
      if (v.at && !v.paused){ pendingSeek = (v.t || 0) + (Date.now() - v.at) / 1000; if (channel().kind === 'upload') { seek(pendingSeek); pendingSeek = null; } }
    }
    if (!!v.paused !== paused) setPaused(!!v.paused, { remote: true });
  }
  onShared('tv', (v, by) => applyShared(v, by).catch(e => reportError('tv sync', e)));
  onMessage('tv', m => {
    if (!m || m.channel !== channelId || !on) return;
    if (m.action === 'pause' && !paused) setPaused(true, { remote: true });
    if (m.action === 'play' && paused) setPaused(false, { remote: true });
    if (m.action === 'seek' || m.action === 'play' || m.action === 'pause' || m.action === 'sync'){
      if (Math.abs(position() - m.t) > 2.5) seek(m.t + 0.25);
      if (m.action === 'sync' && paused) setPaused(false, { remote: true });
    }
  });
  // whoever pressed play last keeps the other in step while you're both here
  setInterval(() => {
    const k = channel().kind;
    if (!on || paused || (k !== 'upload' && k !== 'youtube') || !bothHere()) return;
    if ((getShared('tv') || {}).by !== getMe()) return;
    send('tv', { action: 'sync', t: position(), channel: channelId });
  }, 4000);
  onHere(() => { renderRemote(); if (watching && bothHere() && on && hasSound()) window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'watch-together' })); });

  async function refreshVideos(){
    try { videos = await listVideos(); }
    catch(e){ if (!e.needsMigration) reportError('tv list', e); }
    if (!channels().some(c => c.id === channelId)) channelId = 'photos';
    renderRemote();
  }

  /* ---- the remote ---- */
  const remote = document.createElement('div');
  remote.className = 'tv-remote';
  remote.innerHTML = `
    <div class="tvr-bar">
      <button class="tvr-btn tvr-power" title="Turn the TV on/off">⏻</button>
      <div class="tvr-now"><span class="tvr-label">on the TV</span><span class="tvr-title"></span></div>
      <button class="tvr-btn tvr-play" title="Play / pause"></button>
      <button class="tvr-btn tvr-mute" title="Sound"></button>
      <input class="tvr-vol" type="range" min="0" max="1" step="0.01">
      <button class="tvr-btn tvr-watch" title="Sit down and watch">📺</button>
      <button class="tvr-btn tvr-toggle" title="Channels"></button>
      <button class="tvr-btn tvr-close" title="Hide the remote — the TV keeps playing">&times;</button>
    </div>
    <div class="tvr-more">
      <div class="tvr-channels"></div>
      <div class="tvr-add">
        <button class="ui-btn tvr-add-video">+ Upload a video</button>
        <button class="ui-btn tvr-add-yt">+ YouTube link</button>
        <span class="tvr-note">videos up to 50 MB · storage is shared, keep them short</span>
      </div>
    </div>`;
  document.getElementById('screen-room').appendChild(remote);
  const $ = s => remote.querySelector(s);
  $('.tvr-vol').value = volume;
  let expanded = false;

  $('.tvr-power').addEventListener('click', () => {
    on = !on; persist();
    tune(channelId);
  });
  $('.tvr-play').addEventListener('click', () => setPaused(!paused));
  $('.tvr-mute').addEventListener('click', () => {
    muted = !muted;
    video.muted = muted; applyYtSound();
    renderRemote();
  });
  $('.tvr-vol').addEventListener('input', e => {
    volume = Number(e.target.value);
    video.volume = volume;
    if (muted && volume > 0){ muted = false; video.muted = false; }
    applyYtSound(); persist(); renderRemote(true);
  });
  $('.tvr-watch').addEventListener('click', watch);
  $('.tvr-toggle').addEventListener('click', () => { expanded = !expanded; renderRemote(); });
  $('.tvr-close').addEventListener('click', () => {
    dismissed = true; expanded = false; persist();
    if (watching) goBack();                 // stand up; the TV keeps going
    renderRemote();
    if (hasSound()) toast('the TV keeps playing — click the TV to get the remote back', 3500);
  });
  $('.tvr-add-video').addEventListener('click', uploadVideo);
  $('.tvr-add-yt').addEventListener('click', addYt);

  function renderRemote(soundOnly = false){
    const c = channel();
    const k = c.kind;
    $('.tvr-mute').textContent = muted || volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : '🔊';
    if (soundOnly) return;
    // in the room the remote shows only while something with sound is on
    remote.classList.toggle('show', watching || (hasSound() && !dismissed));
    remote.classList.toggle('expanded', expanded);
    remote.classList.toggle('watching', watching);
    $('.tvr-title').textContent = on ? (c.title || 'Untitled') : 'TV is off';
    $('.tvr-label').textContent = on && hasSound() && bothHere() ? `watching with ${shortOf(other())} ♥` : 'on the TV';
    $('.tvr-power').classList.toggle('off', !on);
    const media = on && (k === 'upload' || k === 'youtube');
    $('.tvr-play').style.display = media ? '' : 'none';
    $('.tvr-mute').style.display = media ? '' : 'none';
    $('.tvr-vol').style.display = media ? '' : 'none';
    $('.tvr-play').textContent = paused ? '▶' : '⏸';
    $('.tvr-toggle').textContent = expanded ? '▾' : '▴';
    document.getElementById('hint')?.classList.toggle('hidden', remote.classList.contains('show'));

    const wrap = $('.tvr-channels');
    wrap.innerHTML = '';
    channels().forEach(ch => {
      const b = document.createElement('div');
      b.className = 'tv-ch' + (ch.id === c.id && on ? ' active' : '');
      const icon = ch.kind === 'photos' ? '🖼' : ch.kind === 'youtube' ? '▶' : '🎞';
      b.innerHTML = `<span class="tv-ch-icon">${icon}</span><span class="tv-ch-title">${esc(ch.title || 'Untitled')}</span>`
        + (ch.kind !== 'photos' ? `<button class="tv-ch-x" title="Remove">&times;</button>` : '');
      b.addEventListener('click', e => {
        if (e.target.closest('.tv-ch-x')) return;
        if (!on){ on = true; persist(); }
        tune(ch.id);
      });
      b.querySelector('.tv-ch-x')?.addEventListener('click', async e => {
        e.stopPropagation();
        if (!await showConfirm(`Remove "${ch.title || 'this'}" from the TV?`, 'Remove', 'Remove')) return;
        try {
          if (ch.id === channelId){ video.pause(); video.removeAttribute('src'); video.dataset.src = ''; hideYouTube(); channelId = 'photos'; }
          await removeVideo(ch); await refreshVideos(); tune(channelId);
        } catch(err){ toast(err.message || "couldn't remove it"); }
      });
      wrap.appendChild(b);
    });
  }

  /* ---- sitting down to watch ---- */
  function watch(){
    dismissed = false; persist();
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'tv-watch' }));
    if (bothHere() && on && hasSound()) window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'watch-together' }));
    const view = frontView(info, camera, 0.66);
    // sit a touch low so the remote at the bottom doesn't cover the picture
    const lift = info.height * 0.16;
    view.pos.y -= lift; view.target.y -= lift;
    focusTo('tv', view.pos, view.target, () => {
      watching = true;
      expanded = true;
      if (muted){ muted = false; video.muted = false; video.volume = volume; applyYtSound(); }
      if (channel().kind === 'upload' && !paused) video.play().catch(() => {});
      // while watching, clicks go to the YouTube player itself
      renderer.domElement.style.pointerEvents = channel().kind === 'youtube' ? 'none' : '';
      renderRemote();
    });
  }

  onBack(was => {
    if (was !== 'tv') return;
    watching = false;
    expanded = false;
    renderer.domElement.style.pointerEvents = '';
    renderRemote();                         // keeps playing; the remote shrinks to a bar
  });

  function uploadVideo(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'video/mp4,video/webm,video/quicktime';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_MEDIA_BYTES){ toast('that one is over 50 MB — trim it first', 6000); return; }
      const title = await showPrompt('What should we call it?', file.name.replace(/\.[^.]+$/, ''), 'New video');
      if (title === null) return;
      toast('uploading… big videos take a minute', 60000);
      try {
        await addVideoFile(file, title);
        toast('on the TV now', 2500);
        await refreshVideos();
        const added = videos[videos.length - 1];
        if (added) tune(added.id);
      } catch(e){
        toast(e.needsMigration ? e.message : (e.message || 'upload failed'), 7000);
        if (!e.needsMigration) reportError('tv upload', e);
      }
    });
    input.click();
  }

  async function addYt(){
    const url = await showPrompt('Paste a YouTube link', '', 'YouTube');
    if (!url) return;
    if (!youTubeId(url)){ toast("that doesn't look like a YouTube link"); return; }
    const title = await showPrompt('What should we call it?', 'our song', 'YouTube');
    if (title === null) return;
    try {
      await addYouTube(url, title);
      await refreshVideos();
      const added = videos[videos.length - 1];
      if (added) tune(added.id);
    } catch(e){
      toast(e.needsMigration ? e.message : (e.message || "couldn't add it"), 7000);
      if (!e.needsMigration) reportError('tv youtube', e);
    }
  }

  loadSlides();
  Promise.all([refreshVideos(), loadShared()]).then(async () => {
    const v = getShared('tv');
    if (v){
      on = v.on !== false; channelId = v.channel || channelId; persist();
      await tune(channelId, { remote: true });
      if (v.at && !v.paused) pendingSeek = (v.t || 0) + (Date.now() - v.at) / 1000;
      if (channel().kind === 'upload' && pendingSeek != null){ seek(pendingSeek); pendingSeek = null; }
      if (v.paused) setPaused(true, { remote: true });
    } else tune(channelId, { remote: true });
  });
  subscribe('tv_videos', refreshVideos);

  /* ---- every frame ---- */
  let acc = 0;
  return {
    key: 'tv',
    objects: [screen, ...body],
    label: () => ({ label: 'The TV', sub: on ? `on now: ${channel().title || 'our photos'}` : 'turned off' }),
    click: watch,
    update(t, dt){
      const c = channel();
      if (on && c.kind === 'youtube' && ytFrame){
        if (screen.material !== holeMat) screen.material = holeMat;
      } else {
        if (screen.material !== mat) screen.material = mat;
        if (!on){
          if (mat.map !== canvasTex){ mat.map = canvasTex; mat.needsUpdate = true; }
          if (acc !== -1){ drawOff(); canvasTex.needsUpdate = true; acc = -1; }
        } else if (c.kind === 'upload' && video.readyState >= 2){
          if (mat.map !== videoTex){ mat.map = videoTex; mat.needsUpdate = true; }
        } else {
          if (mat.map !== canvasTex){ mat.map = canvasTex; mat.needsUpdate = true; }
          acc += dt;
          if (acc >= 1 / 30 || acc < 0){
            drawSlides(Math.max(acc, 0));
            canvasTex.needsUpdate = true;
            acc = 0;
          }
        }
      }
      // follow the picture's colour and brightness
      probeT += dt;
      if (on && probeT > 0.2){
        probeT = 0;
        let read = false;
        if (c.kind === 'upload' && video.readyState >= 2 && !videoTainted){
          read = sampleScreen(video);
          if (!read) videoTainted = true;
        } else if (c.kind !== 'youtube' && c.kind !== 'upload'){
          read = sampleScreen(canvas);
        }
        if (!read){
          // can't see YouTube's pixels: a cool screen light that drifts like a changing scene
          const k = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
          glowTarget.setRGB(0.72 + 0.2 * k, 0.8, 1, THREE.SRGBColorSpace);
          glowBrightTarget = paused ? 0.55 : 0.6 + 0.35 * Math.abs(Math.sin(t * 1.3 + Math.sin(t * 0.4) * 3));
        }
      }
      const ease = Math.min(1, dt * 6);
      glow.lerp(glowTarget, ease);
      glowBright += (glowBrightTarget - glowBright) * ease;
      light.color.copy(glow); panel.color.copy(glow);

      const night = nightAmount();
      const flicker = 1 + Math.sin(t * 3.7) * 0.04 + Math.sin(t * 9.1) * 0.02;
      const level = on ? glowBright * flicker : 0;
      light.intensity = level * (0.35 + night * 3.4);
      panel.intensity = level * (0.6 + night * 6.5);
      if (ytFrame) css.render(cssScene, camera);
    },
  };
}