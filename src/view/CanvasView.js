/*
 * Paper.js - The Swiss Army Knife of Vector Graphics Scripting.
 * http://paperjs.org/
 *
 * Copyright (c) 2011 - 2020, Jürg Lehni & Jonathan Puckey
 * http://juerglehni.com/ & https://puckey.studio/
 *
 * Distributed under the MIT license. See LICENSE file for details.
 *
 * All rights reserved.
 */

/**
 * @name CanvasView
 * @class
 * @private
 */
var CanvasView = View.extend(/** @lends CanvasView# */{
    _class: 'CanvasView',

    /**
     * Creates a view object that wraps a canvas element.
     *
     * @name CanvasView#initialize
     * @param {HTMLCanvasElement} canvas the Canvas object that this view should
     *     wrap
     */
    /**
     * Creates a view object that wraps a newly created canvas element.
     *
     * @name CanvasView#initialize
     * @param {Size} size the size of the canvas to be created
     */
    initialize: function CanvasView(project, canvas) {
        // Handle canvas argument
        if (!(canvas instanceof window.HTMLCanvasElement)) {
            // See if the arguments describe the view size:
            var size = Size.read(arguments, 1);
            if (size.isZero())
                throw new Error(
                        'Cannot create CanvasView with the provided argument: '
                        + Base.slice(arguments, 1));
            canvas = CanvasProvider.getCanvas(size);
        }
        var ctx = this._context = canvas.getContext('2d');
        // Save context right away, and restore in #remove(). Also restore() and
        // save() again in _setElementSize() to prevent accumulation of scaling.
        ctx.save();
        this._pixelRatio = 1;
        if (!/^off|false$/.test(PaperScope.getAttribute(canvas, 'hidpi'))) {
            // Hi-DPI Canvas support based on:
            // https://www.html5rocks.com/en/tutorials/canvas/hidpi/
            var deviceRatio = window.devicePixelRatio || 1,
                backingStoreRatio = DomElement.getPrefixed(ctx,
                        'backingStorePixelRatio') || 1;
            this._pixelRatio = deviceRatio / backingStoreRatio;
        }
        // IRRIS: the ratio asked for; _pixelRatio is the one the backing
        // store can afford at the current size, see _setElementSize()
        this._nativePixelRatio = this._pixelRatio;
        View.call(this, project, canvas);
        // We can't be sure the canvas is clear
        this._needsUpdate = true;
    },

    remove: function remove() {
        this._context.restore();
        return remove.base.call(this);
    },

    _setElementSize: function _setElementSize(width, height) {
        // IRRIS: a backing store past the browser's limits cannot be allocated
        // and its context falls into an error state, so the pixel ratio is
        // lowered for a view that would need more than MAX_SIDE per side or
        // MAX_AREA pixels. And a context that falls into the error state anyway
        // is re-armed: a valid size clears it, so the same canvas comes back at
        // pixel ratio 1 instead of throwing on every draw.
        var previous = this._pixelRatio,
            pixelRatio = this._nativePixelRatio || previous;
        // IRRIS: a cache of another size or pixel ratio is of no use, and the
        // canvas no longer shows the last frame
        this._dropCache();
        this._seed = null;
        if (width > 0 && height > 0)
            pixelRatio = Math.min(pixelRatio,
                    CanvasView.MAX_SIDE / width, CanvasView.MAX_SIDE / height,
                    Math.sqrt(CanvasView.MAX_AREA / (width * height)));
        // update() and Item#draw() read it:
        this._pixelRatio = pixelRatio;
        // Upscale the canvas if the pixel ratio is more than 1.
        _setElementSize.base.call(this, width * pixelRatio, height * pixelRatio);
        if (pixelRatio !== 1 || previous !== 1) {
            var element = this._element,
                ctx = this._context;
            // We need to set the correct size on non-resizable canvases through
            // their style when HiDPI is active, as otherwise they would appear
            // too big.
            if (!PaperScope.hasAttribute(element, 'resize')) {
                var style = element.style;
                style.width = width + 'px';
                style.height = height + 'px';
            }
            // Scale the context to counter the fact that we've manually scaled
            // our canvas element.
            try {
                ctx.restore();
                ctx.save();
                if (pixelRatio !== 1)
                    ctx.scale(pixelRatio, pixelRatio);
            } catch (e) {
                this._pixelRatio = 1;
                _setElementSize.base.call(this, width, height);
                ctx.restore();
                ctx.save();
            }
        }
    },

    getContext: function() {
        return this._context;
    },

    /**
     * Converts the provide size in any of the units allowed in the browser to
     * pixels.
     */
    getPixelSize: function getPixelSize(size) {
        var agent = paper.agent,
            pixels;
        // Firefox doesn't appear to convert context.font sizes to pixels,
        // while other browsers do. Fall-back to View#getPixelSize.
        if (agent && agent.firefox) {
            pixels = getPixelSize.base.call(this, size);
        } else {
            var ctx = this._context,
                prevFont = ctx.font;
            ctx.font = size + ' serif';
            pixels = parseFloat(ctx.font);
            ctx.font = prevFont;
        }
        return pixels;
    },

    getTextWidth: function(font, lines) {
        var ctx = this._context,
            prevFont = ctx.font,
            width = 0;
        ctx.font = font;
        // Measure the real width of the text. Unfortunately, there is no sane
        // way to measure text height with canvas.
        for (var i = 0, l = lines.length; i < l; i++)
            width = Math.max(width, ctx.measureText(lines[i]).width);
        ctx.font = prevFont;
        return width;
    },

    /**
     * Updates the view if there are changes. Note that when using built-in
     * event handlers for interaction, animation and load events, this method is
     * invoked for you automatically at the end.
     *
     * @return {Boolean} {@true if the view was updated}
     */
    update: function() {
        // IRRIS: a window resize skipped while the canvas was hidden (see the
        // View constructor) is applied once the canvas can be measured again.
        if (this._resizeWhenShown) {
            var size = DomElement.getSize(this._element);
            if (!size.isNaN() && !size.isZero()) {
                this._resizeWhenShown = false;
                this.setViewSize(size);
            }
        }
        if (!this._needsUpdate)
            return false;
        var project = this._project,
            ctx = this._context,
            size = this._viewSize;
        // IRRIS: during an interaction (View#beginInteraction()) the frame
        // comes from the cache when it can
        if (!(project && this._interactions && this.cacheEnabled
                && this._updateFromCache(project, ctx, size))) {
            this._dropCache(this.cacheEnabled);
            ctx.clearRect(0, 0, size.width + 1, size.height + 1);
            if (project) {
                project.draw(ctx, this._matrix, this._pixelRatio,
                        Item._getCullArea(this._matrix, 0, 0, size.width,
                            size.height));
                this._seed = this._getSeed(project);
            }
        }
        this._needsUpdate = false;
        return true;
    },

    /**
     * IRRIS: drops the cache when switched off (`false`): every frame is
     * then drawn directly, interactions or not.
     *
     * @type Boolean
     */
    cacheEnabled: true,

    /**
     * IRRIS: the first layer drawn live during an interaction, with every
     * layer above it (in the planner the helper layers: rulers, handles,
     * the flow animation's indicators...); a project without a layer of
     * that name is cached whole (its selection is drawn live).
     *
     * @type String
     */
    cacheLiveLayer: 'rulers',

    // IRRIS: the interaction cache (todo 2026-10-13_1/04). An interaction
    // with a big drawing on a mid-range PC (software rendering, little
    // memory) redrew the whole drawing at every pan step and wheel step:
    // 0.4 - 1.7 s on 1,000 - 3,000 heads. During an interaction the layers
    // below cacheLiveLayer are kept in a canvas of the view plus
    // CACHE_MARGIN of it on each side, at the view's pixel ratio, drawn
    // only where a frame needs it (cache.valid, a rectangle of device px;
    // it grows by CACHE_CHUNK of the margin at least), and seeded with the
    // last frame drawn directly when that frame showed the cached layers
    // only (no live item, no selection, nothing drawn into the cache
    // changed since: _seed). A pan is a copy of it, by whole device px
    // (rounded on a fractional pixel ratio or a fractional move, as a pan
    // of the view's own pixels would be); when the view leaves the margin
    // the cache is moved under it. A wheel step of a zoom interaction
    // scales it (smoothed: a short blur) while it holds what falls on the
    // view (nothing drawn yet: drawn at the step's zoom; zoomed out past
    // it: that step drawn directly). With neither a pan nor a zoom going on
    // (another kind: the planner's flow animation over a still view, todo
    // 2026-10-13_6/09) it is used only as a direct frame drew it at the
    // view's matrix (cache.exact): a frame has a direct frame's pixels. A
    // change of anything drawn into it (Project#_changed(), a picture's
    // screen copies made: Raster) draws it again. The live layers and the
    // selection are drawn at every frame over it. The last interaction's end
    // drops it and draws the frame directly, as a frame without interactions.
    _updateFromCache: function(project, ctx, size) {
        var matrix = this._matrix,
            pixelRatio = this._pixelRatio,
            top = this._getLiveIndex(project),
            cache = this._getCache(project, top);
        if (!cache)
            return false;
        var marginX = cache.marginX,
            marginY = cache.marginY,
            width = cache.canvas.width,
            height = cache.canvas.height,
            viewWidth = width - 2 * marginX,
            viewHeight = height - 2 * marginY,
            dx = 0,
            dy = 0,
            scaled = false;
        if (cache.b !== matrix._b || cache.c !== matrix._c) {
            this._resetCache(project, top);
        } else if (cache.a === matrix._a && cache.d === matrix._d
                && !this._interactions.pan && !this._interactions.zoom) {
            // No pan or zoom going on (an animation over a still view, the
            // planner's 'flow'): the cache only as a direct frame drew it at
            // the view's matrix, so the frame has a direct frame's pixels; a
            // view moved meanwhile (a pan that ended, the arrow keys) draws
            // it again (todo 2026-10-13_6/09). An empty one is drawn below.
            if (cache.valid && !(cache.exact && cache.tx === matrix._tx
                    && cache.ty === matrix._ty)) {
                this._seed = null;
                this._resetCache(project, top);
            }
        } else if (cache.a === matrix._a && cache.d === matrix._d) {
            // A pan: the content moves by (dx, dy) device px.
            dx = Math.round((matrix._tx - cache.tx) * pixelRatio);
            dy = Math.round((matrix._ty - cache.ty) * pixelRatio);
            if (Math.abs(dx) > marginX || Math.abs(dy) > marginY) {
                if (Math.abs(dx) < width && Math.abs(dy) < height)
                    this._moveCache(dx, dy);
                else
                    this._resetCache(project, top);
                dx = Math.round((matrix._tx - cache.tx) * pixelRatio);
                dy = Math.round((matrix._ty - cache.ty) * pixelRatio);
            }
        } else if (this._interactions.zoom) {
            scaled = this._drawScaledCache(project, ctx);
            if (!scaled && cache.valid) {
                // Zoomed out past what it holds: this frame is drawn directly
                // (drawing it in costs more: the canvas is copied when
                // changed after a draw from it) and seeds the next one.
                this._dropCache(true);
                return false;
            }
            if (!scaled)
                this._resetCache(project, top);
        } else {
            this._resetCache(project, top);
        }
        if (!scaled && !cache.valid) {
            // Nothing in it yet: the cached layers drawn as a direct frame
            // draws them, at the view's matrix, then copied into its middle
            // (one copy, not a second drawing): this frame is a direct one.
            this._setCacheMatrix(matrix);
            ctx.clearRect(0, 0, size.width + 1, size.height + 1);
            project._drawLayers(ctx, matrix, pixelRatio, 0, top,
                    Item._getCullArea(matrix, 0, 0, size.width, size.height));
            this._copyViewIntoCache();
        } else if (!scaled) {
            this._fillCache(project, marginX - dx, marginY - dy,
                    marginX - dx + viewWidth, marginY - dy + viewHeight);
            // 'copy': the cache replaces the view's pixels in one pass (it
            // covers the view: |dx|, |dy| are within the margins); the whole
            // canvas, not a source rectangle (with 'copy' that takes a slow
            // path: 38 against 15 ms on the mid-range emulation)
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(cache.canvas, dx - marginX, dy - marginY);
            ctx.restore();
        }
        // The live layers and the selection, at the view's own matrix.
        project._drawLayers(ctx, matrix, pixelRatio, top,
                project._children.length,
                Item._getCullArea(matrix, 0, 0, size.width, size.height));
        project._drawSelection(ctx, matrix);
        this._seed = null;
        this._cacheDrawn = true;
        return true;
    },

    // IRRIS: drops the cache. keep: its canvas is kept CACHE_RELEASE_MS for
    // the next cache (a pan after a zoom...), else it, and any kept, is
    // freed now (a resize, a hidden view, the cache switched off).
    _dropCache: function(keep) {
        var cache = this._cache,
            spare = this._spare,
            that = this;
        this._cache = null;
        if (cache && keep) {
            if (spare && spare !== cache.canvas)
                spare.width = spare.height = 0;
            spare = this._spare = cache.canvas;
            clearTimeout(this._spareTimer);
            this._spareTimer = setTimeout(function() {
                if (that._spare === spare) {
                    that._spare = null;
                    spare.width = spare.height = 0;
                }
            }, CanvasView.CACHE_RELEASE_MS);
        } else {
            // Gives the memory back now, not at the next garbage collection.
            if (cache)
                cache.canvas.width = cache.canvas.height = 0;
            if (!keep && spare) {
                this._spare = null;
                spare.width = spare.height = 0;
            }
        }
    },

    // IRRIS: the index of #cacheLiveLayer (the layers' count without it).
    _getLiveIndex: function(project) {
        var layers = project._children;
        for (var i = 0, l = layers.length; i < l; i++) {
            if (layers[i]._name === this.cacheLiveLayer)
                return i;
        }
        return layers.length;
    },

    // IRRIS: what a frame drawn directly offers an interaction's cache: its
    // pixels, if it showed the cached layers only (no live layer with an
    // item, no selection); Project#_changed() marks it dirty when anything
    // drawn into it changes.
    _getSeed: function(project) {
        var layers = project._children,
            top = this._getLiveIndex(project),
            matrix = this._matrix,
            size = this._viewSize;
        if (project._selectionCount > 0)
            return null;
        for (var i = top, l = layers.length; i < l; i++) {
            var layer = layers[i];
            if (layer._visible && layer._opacity > 0 && layer._children.length)
                return null;
        }
        return {
            top: top, pixelRatio: this._pixelRatio,
            width: size.width, height: size.height,
            a: matrix._a, b: matrix._b, c: matrix._c, d: matrix._d,
            tx: matrix._tx, ty: matrix._ty, dirty: false
        };
    },

    // IRRIS: the cache for the view's size and pixel ratio (a new canvas if
    // there is none of the size; null when none can be had), drawn again
    // from nothing when stale or the live layer moved.
    _getCache: function(project, top) {
        var size = this._viewSize,
            pixelRatio = this._pixelRatio,
            element = this._element,
            cache = this._cache,
            marginX = Math.round(size.width * pixelRatio
                    * CanvasView.CACHE_MARGIN),
            marginY = Math.round(size.height * pixelRatio
                    * CanvasView.CACHE_MARGIN),
            width = element.width + 2 * marginX,
            height = element.height + 2 * marginY;
        if (cache && cache.canvas.width === width
                && cache.canvas.height === height
                && cache.pixelRatio === pixelRatio
                && cache.width === size.width && cache.height === size.height) {
            if (cache.stale || cache.top !== top)
                this._resetCache(project, top);
            return cache;
        }
        this._dropCache(true);
        // The canvas kept from the last cache (_dropCache), if of the size:
        // a new one costs its memory's allocation (~100 ms on the mid-range
        // emulation's 2x screen).
        var canvas = this._spare,
            context;
        this._spare = null;
        if (canvas && (canvas.width !== width || canvas.height !== height)) {
            canvas.width = canvas.height = 0;
            canvas = null;
        }
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
        }
        context = canvas.getContext('2d');
        if (!context || canvas.width !== width || canvas.height !== height)
            return null;
        this._cache = cache = {
            canvas: canvas, context: context, pixelRatio: pixelRatio,
            width: size.width, height: size.height,
            marginX: marginX, marginY: marginY,
            chunkX: Math.round(marginX * CanvasView.CACHE_CHUNK),
            chunkY: Math.round(marginY * CanvasView.CACHE_CHUNK)
        };
        this._resetCache(project, top);
        return cache;
    },

    // IRRIS: the cache emptied at the view's matrix, or seeded with the last
    // frame drawn directly (at its matrix) when that frame can be (_seed).
    _resetCache: function(project, top) {
        var cache = this._cache,
            matrix = this._matrix,
            seed = this._seed;
        cache.stale = false;
        cache.top = top;
        if (seed && !seed.dirty && seed.top === top
                && seed.pixelRatio === cache.pixelRatio
                && seed.width === cache.width && seed.height === cache.height
                && seed.b === matrix._b && seed.c === matrix._c) {
            // The view's pixels are that frame's still (a frame drawn from the
            // cache, or a resize, ends the seed): its items keep their
            // _updateVersion (drawn as Project#draw() drew them).
            this._copyViewIntoCache();
            this._setCacheMatrix({ _a: seed.a, _b: seed.b, _c: seed.c,
                    _d: seed.d, _tx: seed.tx, _ty: seed.ty });
            cache.seeded = true;
        } else {
            // As Project#draw(): the items drawn from now on are the ones
            // drawn.
            project._updateVersion++;
            cache.valid = null;
            cache.exact = false;
            this._setCacheMatrix(matrix);
            cache.seeded = false;
        }
        this._seed = null;
    },

    // IRRIS: the view matrix the cache's content is drawn at.
    _setCacheMatrix: function(matrix) {
        var cache = this._cache;
        cache.a = matrix._a;
        cache.b = matrix._b;
        cache.c = matrix._c;
        cache.d = matrix._d;
        cache.tx = matrix._tx;
        cache.ty = matrix._ty;
    },

    // IRRIS: the view's pixels copied into the cache's middle, which they
    // make valid (all else is not).
    _copyViewIntoCache: function() {
        var cache = this._cache,
            context = cache.context,
            element = this._element;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = 'copy';
        context.drawImage(element, cache.marginX, cache.marginY);
        context.restore();
        cache.valid = [cache.marginX, cache.marginY,
                cache.marginX + element.width, cache.marginY + element.height];
        // A direct frame's pixels: exact at the cache's matrix (moved: no
        // longer, see _moveCache()).
        cache.exact = true;
    },

    // IRRIS: the cache's rectangle (x0, y0) - (x1, y1), device px, made
    // valid: the valid rectangle grown to hold it, by the chunk at least on
    // each side it grows, the strips it gains drawn.
    _fillCache: function(project, x0, y0, x1, y1) {
        var cache = this._cache,
            width = cache.canvas.width,
            height = cache.canvas.height,
            valid = cache.valid;
        x0 = Math.max(0, Math.floor(x0));
        y0 = Math.max(0, Math.floor(y0));
        x1 = Math.min(width, Math.ceil(x1));
        y1 = Math.min(height, Math.ceil(y1));
        if (!(x0 < x1 && y0 < y1))
            return;
        if (!valid) {
            this._drawCache(project, x0, y0, x1 - x0, y1 - y0);
            cache.valid = [x0, y0, x1, y1];
            return;
        }
        var u0 = valid[0], v0 = valid[1], u1 = valid[2], v1 = valid[3];
        if (x0 >= u0 && y0 >= v0 && x1 <= u1 && y1 <= v1)
            return;
        var n0 = x0 < u0 ? Math.max(0, x0 - cache.chunkX) : u0,
            m0 = y0 < v0 ? Math.max(0, y0 - cache.chunkY) : v0,
            n1 = x1 > u1 ? Math.min(width, x1 + cache.chunkX) : u1,
            m1 = y1 > v1 ? Math.min(height, y1 + cache.chunkY) : v1;
        if (m0 < v0)
            this._drawCache(project, n0, m0, n1 - n0, v0 - m0);
        if (m1 > v1)
            this._drawCache(project, n0, v1, n1 - n0, m1 - v1);
        if (n0 < u0)
            this._drawCache(project, n0, v0, u0 - n0, v1 - v0);
        if (n1 > u1)
            this._drawCache(project, u1, v0, n1 - u1, v1 - v0);
        cache.valid = [n0, m0, n1, m1];
    },

    // IRRIS: the cache's content moved by (dx, dy) device px, the view kept
    // in its middle: what was valid moves with it.
    _moveCache: function(dx, dy) {
        var cache = this._cache,
            context = cache.context,
            valid = cache.valid,
            width = cache.canvas.width,
            height = cache.canvas.height;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = 'copy';
        context.drawImage(cache.canvas, dx, dy);
        context.restore();
        cache.tx += dx / cache.pixelRatio;
        cache.ty += dy / cache.pixelRatio;
        cache.exact = false;
        if (valid) {
            var x0 = Math.max(0, valid[0] + dx),
                y0 = Math.max(0, valid[1] + dy),
                x1 = Math.min(width, valid[2] + dx),
                y1 = Math.min(height, valid[3] + dy);
            cache.valid = x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null;
        }
    },

    // IRRIS: the cached layers drawn into the cache's device px rectangle
    // (x, y, width, height), at the cache's matrix: the view's, translated
    // to its own tx, ty and by the margin.
    _drawCache: function(project, x, y, width, height) {
        var cache = this._cache,
            context = cache.context,
            ctx = this._context,
            pixelRatio = cache.pixelRatio,
            matrix = new Matrix(1, 0, 0, 1, cache.marginX / pixelRatio,
                cache.marginY / pixelRatio).append(new Matrix(cache.a,
                    cache.b, cache.c, cache.d, cache.tx, cache.ty));
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.beginPath();
        context.rect(x, y, width, height);
        context.clip();
        context.clearRect(x, y, width, height);
        // The view's own drawing state (the planner turns smoothing off).
        context.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
        context.imageSmoothingQuality = ctx.imageSmoothingQuality;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        project._drawLayers(context, matrix, pixelRatio, 0, cache.top,
                Item._getCullArea(matrix, x / pixelRatio, y / pixelRatio,
                    (x + width) / pixelRatio, (y + height) / pixelRatio));
        context.restore();
    },

    // IRRIS: a wheel step: the cache scaled onto the view; false when the
    // part of it that falls on the view is not all drawn in it (nothing yet,
    // or zoomed out past it) or the step turned the view.
    _drawScaledCache: function(project, ctx) {
        var cache = this._cache,
            matrix = this._matrix,
            pixelRatio = this._pixelRatio,
            canvas = ctx.canvas,
            scale = matrix._a / cache.a,
            x = pixelRatio * matrix._tx
                - scale * (cache.marginX + pixelRatio * cache.tx),
            y = pixelRatio * matrix._ty
                - scale * (cache.marginY + pixelRatio * cache.ty),
            // The cache's px on the view, and one more for the smoothing.
            x0 = -x / scale - 1,
            y0 = -y / scale - 1,
            x1 = (canvas.width - x) / scale + 1,
            y1 = (canvas.height - y) / scale + 1;
        var valid = cache.valid;
        if (!(scale > 0 && Math.abs(matrix._d / cache.d - scale) < 1e-9
                && valid && x0 >= valid[0] && y0 >= valid[1]
                && x1 <= valid[2] && y1 <= valid[3]))
            return false;
        // Only the part that falls on the view, in whole cache px.
        x0 = Math.floor(x0);
        y0 = Math.floor(y0);
        x1 = Math.ceil(x1);
        y1 = Math.ceil(y1);
        // (cleared, then drawn over: 'copy' takes a slower path when scaling,
        // 77 against 55 ms on the mid-range emulation's 2x screen)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, x, y);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(cache.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0,
                x1 - x0, y1 - y0);
        ctx.restore();
        return true;
    }
});

// IRRIS: the interaction cache's margin on each side, a share of the view; it
// is drawn in chunks of a share of the margin at least.
CanvasView.CACHE_MARGIN = 0.25;
CanvasView.CACHE_CHUNK = 0.5;
// IRRIS: how long a dropped cache's canvas is kept for the next one, ms.
CanvasView.CACHE_RELEASE_MS = 3000;

// IRRIS: backing-store limits for CanvasView#_setElementSize(), below every
// current browser's canvas maximum (Chrome / Firefox: 32767 px per side,
// Firefox ~500 megapixels) and far above any viewport x pixel ratio.
CanvasView.MAX_SIDE = 16384;
CanvasView.MAX_AREA = 64 * 1024 * 1024;
