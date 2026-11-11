import Konva from 'konva';
import { PAPERS } from './books.js';

export const TAPE_COLORS = ['#d9c9a8','#c9a6a6','#a6bfc9','#bfc9a6','#d4b483'];
export const STICKERS = ['❤️','✨','🌷','🎞️','☕','🌙','⭐','🦋','🍓','📌','💌','🌊','🕯️','🧸','🎀','🍰','🐻','🌻'];

/* ================= paper ================= */
export function paintPaper(layer, paperId, W, H, opts = {}){
  layer.destroyChildren();
  if (!paperId){ layer.draw(); return; }

  const paper = PAPERS.find(p => p.id === paperId) || PAPERS[0];
  const dark = paperId === 'charcoal';
  const ink = dark ? '#ffffff' : '#6b5334';

  layer.add(new Konva.Rect({ x:0, y:0, width:W, height:H, fill:paper.css, name:'page-bg' }));

  if (paper.pattern === 'ruled'){
    for (let y=52; y<H-20; y+=26)
      layer.add(new Konva.Line({ points:[26,y,W-26,y], stroke:'#8fa6c4', strokeWidth:.8, opacity:.34, listening:false }));
    layer.add(new Konva.Line({ points:[52,20,52,H-20], stroke:'#c98b8b', strokeWidth:1, opacity:.36, listening:false }));
  } else if (paper.pattern === 'grid'){
    for (let x=24; x<W; x+=22)
      layer.add(new Konva.Line({ points:[x,18,x,H-18], stroke:'#9aa98f', strokeWidth:.6, opacity:.26, listening:false }));
    for (let y=24; y<H; y+=22)
      layer.add(new Konva.Line({ points:[18,y,W-18,y], stroke:'#9aa98f', strokeWidth:.6, opacity:.26, listening:false }));
  } else if (paper.pattern === 'dots'){
    for (let x=26; x<W-16; x+=24)
      for (let y=26; y<H-16; y+=24)
        layer.add(new Konva.Circle({ x, y, radius:1.15, fill:'#8a7f66', opacity:.36, listening:false }));
  } else if (paper.pattern === 'weave'){
    for (let x=0; x<W; x+=3)
      layer.add(new Konva.Line({ points:[x,0,x,H], stroke:'#000', strokeWidth:1, opacity:.035, listening:false }));
    for (let y=0; y<H; y+=3)
      layer.add(new Konva.Line({ points:[0,y,W,y], stroke:'#fff', strokeWidth:1, opacity:.045, listening:false }));
  }

  const fibres = Math.round(W * H / 380);
  for (let i=0;i<fibres;i++){
    layer.add(new Konva.Rect({
      x:Math.random()*W, y:Math.random()*H,
      width:Math.random()*2.6+.4, height:Math.random()*1.5+.3,
      fill:ink, opacity:Math.random()*0.07+0.012,
      rotation:Math.random()*180, listening:false
    }));
  }
  for (let i=0;i<Math.round(fibres/15);i++){
    layer.add(new Konva.Circle({
      x:Math.random()*W, y:Math.random()*H, radius:Math.random()*1.5+.3,
      fill: dark ? '#fff' : '#5a4428', opacity:Math.random()*0.16+0.05, listening:false
    }));
  }

  layer.add(new Konva.Rect({
    x:0,y:0,width:W,height:H, listening:false,
    stroke: dark ? 'rgba(0,0,0,.5)' : 'rgba(110,80,40,.34)', strokeWidth:3, opacity:.5
  }));

  layer.add(new Konva.Rect({
    x:0,y:0,width:W,height:H, listening:false,
    fillRadialGradientStartPoint:{x:W/2,y:H/2}, fillRadialGradientStartRadius:Math.min(W,H)*.25,
    fillRadialGradientEndPoint:{x:W/2,y:H/2}, fillRadialGradientEndRadius:Math.max(W,H)*.8,
    fillRadialGradientColorStops:[0,'rgba(0,0,0,0)',1, dark?'rgba(0,0,0,.4)':'rgba(90,60,25,.2)']
  }));

  // gutter shading + punched holes, only where a page meets the coil
  if (opts.gutter){
    const onLeft = opts.gutter === 'left';
    layer.add(new Konva.Rect({
      x: onLeft ? W-52 : 0, y:0, width:52, height:H, listening:false,
      fillLinearGradientStartPoint:{x: onLeft?0:52, y:0},
      fillLinearGradientEndPoint:{x: onLeft?52:0, y:0},
      fillLinearGradientColorStops:[0,'rgba(0,0,0,0)',.55,'rgba(40,25,8,.1)',1,'rgba(35,20,5,.34)']
    }));
    const holeX = onLeft ? W-15 : 15;
    const count = Math.max(8, Math.round(H/42));
    for (let i=0;i<count;i++){
      const y = (H/(count+1))*(i+1);
      layer.add(new Konva.Ellipse({ x:holeX, y, radiusX:5.5, radiusY:6.5, fill:'rgba(25,15,5,.62)', listening:false }));
      layer.add(new Konva.Ellipse({ x:holeX, y:y+1.2, radiusX:5.5, radiusY:6.5,
        stroke:'rgba(255,255,255,.2)', strokeWidth:1, listening:false }));
    }
  }
  layer.draw();
}

/* ================= photo ================= */
export function layoutPhoto(g, img, iw, ih){
  g.destroyChildren();
  const frame = g.getAttr('_frame') || 'polaroid';
  const pad = frame === 'polaroid' ? 10 : (frame === 'border' ? 6 : 0);
  const bottomPad = frame === 'polaroid' ? Math.max(26, ih * 0.2) : pad;

  if (frame !== 'none'){
    g.add(new Konva.Rect({
      x:0, y:0, width:iw + pad*2, height:ih + pad + bottomPad, fill:'#fffdf7',
      shadowColor:'#000', shadowBlur:13, shadowOpacity:.34, shadowOffset:{x:2,y:5}
    }));
  }
  g.add(new Konva.Image({ image:img, x:pad, y:pad, width:iw, height:ih }));

  if (frame === 'polaroid'){
    g.add(new Konva.Text({
      x:pad, y:pad + ih + Math.max(6, bottomPad*0.25), width:iw, align:'center',
      text:g.getAttr('_caption') || '', fontSize:Math.max(11, Math.min(18, iw*0.1)),
      fontFamily:'Caveat', fill:'#4a3a2a'
    }));
  }
  if (frame === 'tape'){
    const tc = g.getAttr('_tape') || TAPE_COLORS[0];
    [[pad+2,-6,-16],[iw-16,ih-2,14]].forEach(([tx,ty,rot]) =>
      g.add(new Konva.Rect({ x:tx, y:ty, width:40, height:15, rotation:rot, fill:tc, opacity:.78 })));
  }
  g.setAttr('_iw', iw);
  g.setAttr('_ih', ih);
}

export function buildPhoto(el, draggable, onReady){
  const img = new Image();
  img.onload = () => {
    const g = new Konva.Group({ id:el.id, x:el.x, y:el.y, rotation:el.rotation||0, draggable });
    g.setAttr('_kind','photo');
    g.setAttr('_src', el.src);
    g.setAttr('_frame', el.frame || 'polaroid');
    g.setAttr('_caption', el.caption || '');
    g.setAttr('_tape', el.tape || TAPE_COLORS[Math.floor(Math.random()*TAPE_COLORS.length)]);
    g.setAttr('_img', img);
    layoutPhoto(g, img, el.width, el.height);
    onReady(g);
  };
  img.onerror = () => onReady(null);
  img.src = el.src;
}

export function buildNote(el, draggable){
  const g = new Konva.Group({ id:el.id, x:el.x, y:el.y, rotation:el.rotation||0, draggable });
  g.setAttr('_kind','note'); g.setAttr('_style', el.noteStyle||'hand');
  const style = el.noteStyle||'hand', w = el.width||190, fs = el.fontSize||19;
  if (style === 'card'){
    g.add(new Konva.Rect({ x:-10,y:-8,width:w+20,height:fs*2.4+18, fill:'#fffdf5',
      shadowColor:'#000', shadowBlur:8, shadowOpacity:.22, shadowOffset:{x:1,y:3} }));
  }
  g.add(new Konva.Text({ text:el.text, width:w, fontSize:fs,
    fontFamily: style==='type' ? 'Special Elite' : (style==='serif' ? 'Playfair Display' : 'Caveat'),
    fill: el.fill||'#3d2f21', lineHeight:1.35 }));
  g.setAttr('_text', el.text);
  return g;
}

export function buildSticker(el, draggable){
  const t = new Konva.Text({ id:el.id, x:el.x, y:el.y, rotation:el.rotation||0,
    text:el.text, fontSize:el.fontSize||38, draggable });
  t.setAttr('_kind','sticker'); return t;
}

export function buildTape(el, draggable){
  const r = new Konva.Rect({ id:el.id, x:el.x, y:el.y, rotation:el.rotation||0,
    width:el.width||88, height:el.height||24, fill:el.fill||TAPE_COLORS[0], opacity:.8, draggable });
  r.setAttr('_kind','tape'); return r;
}

/* ================= serialise ================= */
export function serializeNode(n){
  const kind = n.getAttr('_kind');
  const base = { id:n.id(), x:n.x(), y:n.y(), rotation:n.rotation() };
  if (kind === 'photo'){
    return { ...base, type:'photo', src:n.getAttr('_src'),
      width:n.getAttr('_iw'), height:n.getAttr('_ih'),
      frame:n.getAttr('_frame'), caption:n.getAttr('_caption'), tape:n.getAttr('_tape') };
  }
  if (kind === 'note'){
    const t = n.findOne('Text');
    return { ...base, type:'note', text:n.getAttr('_text'), fontSize:t.fontSize(),
      width:t.width(), fill:t.fill(), noteStyle:n.getAttr('_style') };
  }
  if (kind === 'sticker') return { ...base, type:'sticker', text:n.text(), fontSize:n.fontSize() };
  if (kind === 'tape')    return { ...base, type:'tape', width:n.width(), height:n.height(), fill:n.fill() };
  return null;
}

/** Bake any transform into real pixel sizes and reset scale to 1. */
export function bakeTransform(node){
  const kind = node.getAttr('_kind');
  if (kind === 'photo'){
    const iw = Math.max(20, node.getAttr('_iw') * node.scaleX());
    const ih = Math.max(20, node.getAttr('_ih') * node.scaleY());
    node.scaleX(1); node.scaleY(1);
    layoutPhoto(node, node.getAttr('_img'), iw, ih);
  } else if (kind === 'sticker'){
    node.fontSize(Math.max(12, node.fontSize()*node.scaleY()));
    node.scaleX(1); node.scaleY(1);
  } else if (kind === 'tape'){
    node.width(Math.max(18, node.width()*node.scaleX()));
    node.height(Math.max(7, node.height()*node.scaleY()));
    node.scaleX(1); node.scaleY(1);
  } else if (kind === 'note'){
    const t = node.findOne('Text');
    t.fontSize(Math.max(9, t.fontSize()*node.scaleY()));
    t.width(Math.max(40, t.width()*node.scaleX()));
    node.scaleX(1); node.scaleY(1);
  }
}
