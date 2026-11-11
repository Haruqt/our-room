/**
 * Paper-like page turn for a two-page spread.
 *
 * A single rotating plane reads as cardboard because real paper bows as it
 * turns. So the sheet is sliced into vertical strips and each strip is placed
 * at the end of the previous one, rotated a little further — accumulating those
 * rotations builds a genuinely curved surface. Letting the curve's amplitude
 * rise and fall across the turn makes the bend travel like a wave.
 *
 * Direction handling: a right-hand page is hinged on its LEFT edge; a left-hand
 * page is hinged on its RIGHT edge. Rather than write the integration twice,
 * the 'right' case mirrors the whole layer and un-mirrors each strip's face, so
 * the same left-to-right math drives both.
 */

const STRIPS = 26;

export function flipPage({
  container, landing, snapshot, width, height,
  hinge = 'left',          // 'left' = right-hand page turning back; 'right' = left-hand page turning forward
  duration = 1050,
  onMidpoint, onDone
}){
  const mirrored = hinge === 'right';

  const layer = document.createElement('div');
  layer.className = 'pf-layer';
  layer.style.width = width + 'px';
  layer.style.height = height + 'px';
  if (mirrored) layer.style.transform = 'scaleX(-1)';

  const stripW = width / STRIPS;
  const strips = [];

  for (let i = 0; i < STRIPS; i++){
    const s = document.createElement('div');
    s.className = 'pf-strip';
    s.style.width = (stripW + 1) + 'px';   // 1px overlap kills seam lines
    s.style.height = height + 'px';

    const face = document.createElement('div');
    face.className = 'pf-face';
    face.style.backgroundImage = `url(${snapshot})`;
    face.style.backgroundSize = `${width}px ${height}px`;
    // in mirrored mode the strip order is reversed, so read the image from the far end
    const srcOffset = mirrored ? (width - (i + 1) * stripW) : (i * stripW);
    face.style.backgroundPosition = `${-srcOffset}px 0`;
    if (mirrored) face.style.transform = 'scaleX(-1)';
    s.appendChild(face);

    const shade = document.createElement('div');
    shade.className = 'pf-shade';
    s.appendChild(shade);

    layer.appendChild(s);
    strips.push({ el:s, shade, face });
  }

  container.innerHTML = '';
  container.appendChild(layer);
  container.classList.add('show');

  // the lifted sheet throws a shadow across the page it's settling onto
  let cast = null;
  if (landing){
    cast = document.createElement('div');
    cast.className = 'pf-cast ' + (mirrored ? 'from-right' : 'from-left');
    landing.innerHTML = '';
    landing.appendChild(cast);
    landing.classList.add('show');
  }

  const start = performance.now();
  let swapped = false;

  function frame(now){
    const raw = Math.min(1, (now - start) / duration);
    const p = raw < 0.5 ? 4*raw*raw*raw : 1 - Math.pow(-2*raw + 2, 3) / 2;
    const bow = Math.sin(p * Math.PI);

    let x = 0, z = 0, angle = 0;

    for (let i = 0; i < STRIPS; i++){
      const t = i / (STRIPS - 1);
      const baseStep = (p * 176) / STRIPS;
      // two overlapping waves — a real sheet doesn't bend in one clean arc
      const ripple = bow * 17 * Math.sin(t * Math.PI * 1.55 - p * Math.PI * 0.9)
                   + bow *  6 * Math.sin(t * Math.PI * 3.1  - p * Math.PI * 1.4);
      const step = baseStep + ripple / STRIPS;

      const rad = angle * Math.PI / 180;
      const { el, shade } = strips[i];
      el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${-angle}deg)`;

      const facing = Math.cos(rad);
      const lift = Math.max(0, Math.sin(rad)) * 0.26;
      shade.style.opacity = String(Math.min(.74, Math.max(0, (1 - Math.abs(facing)) * .82 - lift)));
      el.style.filter = `brightness(${(0.76 + Math.abs(facing) * 0.32 + lift).toFixed(3)})`;

      x += stripW * Math.cos(rad);
      z -= stripW * Math.sin(rad);
      angle += step;
    }

    // shadow sweeps across, strongest as the sheet passes overhead
    if (cast){
      cast.style.opacity = String(Math.sin(p * Math.PI) * 0.5);
      cast.style.transform = `scaleX(${(0.25 + p * 0.85).toFixed(3)})`;
    }

    // swap the underlying pages while the sheet is edge-on and hides the change
    if (!swapped && p >= 0.48){ swapped = true; onMidpoint && onMidpoint(); }

    if (raw < 1){
      requestAnimationFrame(frame);
    } else {
      layer.style.transition = 'opacity .16s ease';
      layer.style.opacity = '0';
      if (landing){
        landing.classList.remove('show');
        landing.innerHTML = '';
      }
      setTimeout(() => {
        container.classList.remove('show');
        container.innerHTML = '';
        onDone && onDone();
      }, 170);
    }
  }
  requestAnimationFrame(frame);
}
