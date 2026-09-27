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
        ctx.clearRect(0, 0, size.width + 1, size.height + 1);
        if (project)
            project.draw(ctx, this._matrix, this._pixelRatio);
        this._needsUpdate = false;
        return true;
    }
});

// IRRIS: backing-store limits for CanvasView#_setElementSize(), below every
// current browser's canvas maximum (Chrome / Firefox: 32767 px per side,
// Firefox ~500 megapixels) and far above any viewport x pixel ratio.
CanvasView.MAX_SIDE = 16384;
CanvasView.MAX_AREA = 64 * 1024 * 1024;
