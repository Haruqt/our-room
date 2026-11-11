import Konva from 'konva';
import {
  paintPaper, buildPhoto, buildNote, buildSticker, buildTape,
  serializeNode, bakeTransform, layoutPhoto, TAPE_COLORS
} from './elements.js';
import { showPrompt, toast } from './ui.js';
import { reportError } from './errors.js';

/**
 * One editable canvas. Pages use two of these (left/right); the book cover and
 * its spine use one each. Everything that can hold photos, notes, stickers and
 * tape goes through here, so the cover edits exactly like a page does.
 */
export class Surface {
  constructor({ containerId, width, height, gutter = null, onSelect = null }){
    this.containerId = containerId;
    this.W = width;
    this.H = height;
    this.gutter = gutter;
    this.onSelect = onSelect;
    this.locked = true;
    this.selected = null;
    this.paper = 'kraft';
    this.stage = null;
    this.loading = false;
    this._loadSeq = 0;
  }

  mount(){
    if (this.stage) return this;
    const el = document.getElementById(this.containerId);
    if (!el){ reportError('Surface.mount', new Error(`container #${this.containerId} not found`)); return this; }

    this.stage = new Konva.Stage({ container:this.containerId, width:this.W, height:this.H });
    this.bg = new Konva.Layer();
    this.content = new Konva.Layer();
    this.ui = new Konva.Layer();
    this.stage.add(this.bg); this.stage.add(this.content); this.stage.add(this.ui);

    this.tr = new Konva.Transformer({
      rotateEnabled:true, borderStroke:'#c9a227', borderDash:[4,4],
      anchorStroke:'#c9a227', anchorFill:'#fffdf7', anchorSize:8,
      enabledAnchors:['top-left','top-right','bottom-left','bottom-right']
    });
    this.ui.add(this.tr);

    this.stage.on('click tap', e => {
      if (this.onSelect) this.onSelect(this);
      if (e.target === this.stage || e.target.name() === 'page-bg') this.select(null);
    });
    return this;
  }

  setPaper(paperId){
    this.paper = paperId;
    paintPaper(this.bg, paperId, this.W, this.H, { gutter:this.gutter });
  }

  clear(){
    if (!this.content) return;
    this.content.destroyChildren();
    this.select(null);
  }

  /**
   * Rebuild the page from saved data, preserving stacking order.
   *
   * This used to add each element as it was ready. Photos need their image to
   * decode first, so they always arrived LAST — every note, sticker and strip
   * of tape ended up buried under every photo, whatever order you arranged them
   * in. Text typed under a polaroid simply vanished behind it on reload, which
   * looked exactly like the text failing to save.
   *
   * Everything is built first, then added in the order it was stored, so what
   * you arranged is what comes back.
   */
  async load(elements, paperId){
    if (!this.stage) return;

    // Each load gets a ticket. If another load starts while images are decoding,
    // this one drops its result instead of painting a page you've already left.
    const ticket = ++this._loadSeq;
    this.loading = true;
    this.clear();
    this.setPaper(paperId);

    const built = await Promise.all((elements || []).map(el => new Promise(resolve => {
      try {
        if (el.type === 'photo')        buildPhoto(el, !this.locked, g => resolve(g));
        else if (el.type === 'note')    resolve(buildNote(el, !this.locked));
        else if (el.type === 'sticker') resolve(buildSticker(el, !this.locked));
        else if (el.type === 'tape')    resolve(buildTape(el, !this.locked));
        else resolve(null);
      } catch(e){ reportError('load element', e); resolve(null); }
    })));

    if (ticket !== this._loadSeq) return;   // superseded; a newer load owns the canvas

    built.forEach(g => { if (g){ this._wire(g); this.content.add(g); } });
    this.content.draw();
    this.loading = false;
  }

  /**
   * Returns null while a load is still in flight. Serialising mid-load would
   * capture a page missing every photo that hadn't decoded yet — and saving
   * that would delete them for good.
   */
  serialize(){
    if (!this.content) return [];
    if (this.loading) return null;
    return this.content.getChildren().map(serializeNode).filter(Boolean);
  }

  _wire(node){
    node.on('click tap', e => {
      e.cancelBubble = true;
      if (this.onSelect) this.onSelect(this);
      if (!this.locked) this.select(node);
    });
    node.on('dragstart', () => { if (this.onSelect) this.onSelect(this); });

    node.on('dblclick dbltap', async e => {
      e.cancelBubble = true;
      if (this.locked){ toast('Unlock to edit'); return; }
      const kind = node.getAttr('_kind');
      if (kind === 'note'){
        const next = await showPrompt('Write your note', node.getAttr('_text'), 'Note');
        if (next !== null){ node.findOne('Text').text(next); node.setAttr('_text', next); this.content.draw(); }
      } else if (kind === 'photo' && node.getAttr('_frame') === 'polaroid'){
        const next = await showPrompt('Caption under the photo', node.getAttr('_caption'), 'Caption');
        if (next !== null){
          node.setAttr('_caption', next);
          layoutPhoto(node, node.getAttr('_img'), node.getAttr('_iw'), node.getAttr('_ih'));
          this.content.draw();
        }
      }
    });

    node.on('transformend', () => { bakeTransform(node); this.content.draw(); });
  }

  select(node){
    this.selected = (node && !this.locked) ? node : null;
    if (this.tr) this.tr.nodes(this.selected ? [this.selected] : []);
    if (this.ui) this.ui.batchDraw();
  }

  setLocked(v){
    this.locked = v;
    if (this.content) this.content.getChildren().forEach(n => n.draggable(!v));
    if (v) this.select(null);
  }

  /** Move the selected item above everything else on the page. */
  bringToFront(){
    if (!this.selected || this.locked) return false;
    this.selected.moveToTop();
    this.content.draw();
    return true;
  }

  /** Tuck it behind everything else. */
  sendToBack(){
    if (!this.selected || this.locked) return false;
    this.selected.moveToBottom();
    this.content.draw();
    return true;
  }

  deleteSelected(){
    if (!this.selected || this.locked) return false;
    this.selected.destroy();
    this.select(null);
    this.content.draw();
    return true;
  }

  /* ---- adders ---- */
  addNote(style){
    const g = buildNote({ id:'n_'+Date.now(), text:'double-click to write…',
      x:this.W/2-95, y:this.H/2-18, width:Math.min(190, this.W-40), fontSize:19, noteStyle:style }, !this.locked);
    this._wire(g); this.content.add(g); this.content.draw(); this.select(g);
  }

  addSticker(ch){
    const g = buildSticker({ id:'s_'+Date.now(), text:ch,
      x:this.W/2-20, y:this.H/2-20, fontSize:40 }, !this.locked);
    this._wire(g); this.content.add(g); this.content.draw(); this.select(g);
  }

  addTape(){
    const g = buildTape({ id:'tp_'+Date.now(), x:this.W/2-44, y:this.H/2-12,
      width:Math.min(88, this.W-20), height:24,
      fill:TAPE_COLORS[Math.floor(Math.random()*TAPE_COLORS.length)],
      rotation:Math.random()*16-8 }, !this.locked);
    this._wire(g); this.content.add(g); this.content.draw(); this.select(g);
  }

  addPhotoFromDataUrl(dataUrl, idx = 0){
    const probe = new Image();
    probe.onload = () => {
      const maxDim = Math.min(150, this.W * 0.42);
      const s = Math.min(maxDim/probe.width, maxDim/probe.height, 1);
      buildPhoto({
        id:'ph_'+Date.now()+'_'+idx, src:dataUrl,
        x: Math.min(this.W - 80, 24 + (idx%2)*(this.W*0.42) + Math.random()*14),
        y: Math.min(this.H - 90, 34 + Math.floor(idx/2)*(this.H*0.38) + Math.random()*14),
        width: probe.width*s, height: probe.height*s,
        rotation: Math.random()*7-3.5, frame:'polaroid', caption:''
      }, !this.locked, g => {
        if (!g) return;
        this._wire(g); this.content.add(g); this.content.draw(); this.select(g);
      });
    };
    probe.src = dataUrl;
  }

  /** Flatten to an image, with selection handles hidden. */
  toDataURL(pixelRatio = 2, mimeType = 'image/png', quality = 1){
    if (!this.stage) return null;
    const had = this.selected;
    this.tr.nodes([]);
    this.ui.batchDraw();
    const url = this.stage.toDataURL({ pixelRatio, mimeType, quality });
    if (had && !this.locked){ this.tr.nodes([had]); this.ui.batchDraw(); }
    return url;
  }
}
