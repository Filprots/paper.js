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
 * @name Raster
 *
 * @class The Raster item represents an image in a Paper.js project.
 *
 * @extends Item
 */
var Raster = Item.extend(/** @lends Raster# */{
    _class: 'Raster',
    _applyMatrix: false,
    _canApplyMatrix: false,
    // Raster doesn't make the distinction between the different bounds,
    // so use the same name for all of them
    _boundsOptions: { stroke: false, handle: false },
    _serializeFields: {
        crossOrigin: null, // NOTE: Needs to be set before source to work!
        source: null
    },
    // Prioritize `crossOrigin` over `source`:
    _prioritize: ['crossOrigin'],
    _smoothing: 'low',
    // Enforce creation of beans, as bean getters have hidden parameters.
    // See  #getContext(_change) below.
    beans: true,

    // TODO: Implement type, width, height.
    // TODO: Have SymbolItem & Raster inherit from a shared class?
    /**
     * Creates a new raster item from the passed argument, and places it in the
     * active layer. `source` can either be a DOM Image, a Canvas, or a string
     * describing the URL to load the image from, or the ID of a DOM element to
     * get the image from (either a DOM Image or a Canvas).
     *
     * @name Raster#initialize
     * @param {HTMLImageElement|HTMLCanvasElement|String} [source] the source of
     *     the raster
     * @param {Point} [position] the center position at which the raster item is
     *     placed
     *
     * @example {@paperscript height=300} // Creating a raster using a url
     * var url = 'http://assets.paperjs.org/images/marilyn.jpg';
     * var raster = new Raster(url);
     *
     * // If you create a Raster using a url, you can use the onLoad
     * // handler to do something once it is loaded:
     * raster.onLoad = function() {
     *     console.log('The image has loaded.');
     * };
     *
     * @example // Creating a raster using the id of a DOM Image:
     *
     * // Create a raster using the id of the image:
     * var raster = new Raster('art');
     *
     * @example // Creating a raster using a DOM Image:
     *
     * // Find the element using its id:
     * var imageElement = document.getElementById('art');
     *
     * // Create the raster:
     * var raster = new Raster(imageElement);
     */
    /**
     * Creates a new empty raster of the given size, and places it in the
     * active layer.
     *
     * @name Raster#initialize
     * @param {Size} size the size of the raster
     * @param {Point} [position] the center position at which the raster item is
     *     placed
     *
     * @example {@paperscript height=150}
     * // Creating an empty raster and fill it with random pixels:
     * var width = 100;
     * var height = 100;
     *
     * // Create an empty raster placed at view center.
     * var raster = new Raster(new Size(width, height), view.center);
     *
     * // For all of its pixels...
     * for (var i = 0; i < width; i++) {
     *     for (var j = 0; j < height; j++) {
     *         // ...set a random color.
     *         raster.setPixel(i, j, Color.random());
     *     }
     * }
     */
    /**
     * Creates a new raster from an object description, and places it in the
     * active layer.
     *
     * @name Raster#initialize
     * @param {Object} object an object containing properties to be set on the
     *     raster
     *
     * @example {@paperscript height=300}
     * var raster = new Raster({
     *     source: 'http://assets.paperjs.org/images/marilyn.jpg',
     *     position: view.center
     * });
     *
     * raster.scale(0.5);
     * raster.rotate(10);
     */
    initialize: function Raster(source, position) {
        // Support three forms of item initialization:
        // - One object literal describing all the different properties.
        // - An image (Image|Canvas|String) and an optional position (Point).
        // - A size (Size) describing the canvas that will be  created and an
        //   optional position (Point).
        // If _initialize can set properties through object literal, we're done.
        // Otherwise we need to check the type of object:
        if (!this._initialize(source,
                position !== undefined && Point.read(arguments))) {
            var image,
                type = typeof source,
                object = type === 'string'
                    ? document.getElementById(source)
                    : type  === 'object'
                        ? source
                        : null;
            if (object && object !== Item.NO_INSERT) {
                if (object.getContext || object.naturalHeight != null) {
                    image = object;
                } else if (object) {
                    // See if the arguments describe the raster size:
                    var size = Size.read(arguments);
                    if (!size.isZero()) {
                        image = CanvasProvider.getCanvas(size);
                    }
                }
            }
            if (image) {
                // #setImage() handles both canvas and image types.
                this.setImage(image);
            } else {
                this.setSource(source);
            }
        }
        if (!this._size) {
            this._size = new Size();
            this._loaded = false;
        }
    },

    _equals: function(item) {
        return this.getSource() === item.getSource();
    },

    copyContent: function(source) {
        var image = source._image,
            canvas = source._canvas;
        if (image) {
            this._setImage(image);
        } else if (canvas) {
            // If the Raster contains a Canvas object, we need to create a new
            // one and draw this raster's canvas on it.
            var copyCanvas = CanvasProvider.getCanvas(source._size);
            copyCanvas.getContext('2d').drawImage(canvas, 0, 0);
            this._setImage(copyCanvas);
        }
        // TODO: Shouldn't this be copied with attributes instead of content?
        this._crossOrigin = source._crossOrigin;
    },

    /**
     * The size of the raster in pixels.
     *
     * @bean
     * @type Size
     */
    getSize: function() {
        var size = this._size;
        return new LinkedSize(size ? size.width : 0, size ? size.height : 0,
                this, 'setSize');
    },

    setSize: function(_size, _clear) {
        var size = Size.read(arguments);
        if (!size.equals(this._size)) { // NOTE: this._size could be null
            if (size.width > 0 && size.height > 0) {
                // Get reference to image before changing canvas.
                var element = !_clear && this.getElement();
                // NOTE: Setting canvas internally sets _size.
                // NOTE: No need to release canvas because #_setImage() does so.
                this._setImage(CanvasProvider.getCanvas(size));
                if (element) {
                    // Draw element back onto the new, resized canvas.
                    this.getContext(true).drawImage(element, 0, 0,
                            size.width, size.height);
                }
            } else {
                // 0-width / height dimensions do not require the creation of
                // an internal canvas. Just reflect the size for now.
                if (this._canvas)
                    CanvasProvider.release(this._canvas);
                this._size = size.clone();
            }
        } else if (_clear) {
            // We can reuse the canvas, but need to clear it.
            this.clear();
        }
    },

    /**
     * The width of the raster in pixels.
     *
     * @bean
     * @type Number
     */
    getWidth: function() {
        return this._size ? this._size.width : 0;
    },

    setWidth: function(width) {
        this.setSize(width, this.getHeight());
    },

    /**
     * The height of the raster in pixels.
     *
     * @bean
     * @type Number
     */
    getHeight: function() {
        return this._size ? this._size.height : 0;
    },

    setHeight: function(height) {
        this.setSize(this.getWidth(), height);
    },

    /**
     * The loading state of the raster image.
     *
     * @bean
     * @type Boolean
     */
    getLoaded: function() {
        return this._loaded;
    },

    isEmpty: function() {
        var size = this._size;
        return !size || size.width === 0 && size.height === 0;
    },

    /**
     * The resolution of the raster at its current size, in PPI (pixels per
     * inch).
     *
     * @bean
     * @type Size
     */
    getResolution: function() {
        var matrix = this._matrix,
            orig = new Point(0, 0).transform(matrix),
            u = new Point(1, 0).transform(matrix).subtract(orig),
            v = new Point(0, 1).transform(matrix).subtract(orig);
        return new Size(
            72 / u.getLength(),
            72 / v.getLength()
        );
    },

    /**
     * @private
     * @bean
     * @deprecated use {@link #resolution} instead.
     */
    getPpi: '#getResolution',

    /**
     * The HTMLImageElement or Canvas element of the raster, if one is
     * associated.
     * Note that for consistency, a {@link #onLoad} event will be triggered on
     * the raster even if the image has already finished loading before, or if
     * we are setting the raster to a canvas.
     *
     * @bean
     * @type HTMLImageElement|HTMLCanvasElement
     */
    getImage: function() {
        return this._image;
    },

    setImage: function(image) {
        var that = this;

        function emit(event) {
            var view = that.getView(),
                type = event && event.type || 'load';
            if (view && that.responds(type)) {
                paper = view._scope;
                that.emit(type, new Event(event));
            }
        }

        this._setImage(image);
        if (this._loaded) {
            // Emit load event with a delay, so behavior is the same as when
            // it's actually loaded and we give the code time to install event.
            setTimeout(emit, 0);
        } else if (image) {
            // Trigger the load event on the image once it's loaded
            DomEvent.add(image, {
                load: function(event) {
                    that._setImage(image);
                    emit(event);
                },
                error: emit
            });
        }
    },

    /**
     * Internal version of {@link #setImage(image)} that does not trigger
     * events. This is used by #setImage(), but also in other places where
     * underlying canvases are replaced, resized, etc.
     */
    _setImage: function(image) {
        if (this._canvas)
            CanvasProvider.release(this._canvas);
        // Due to similarities, we can handle both canvas and image types here.
        if (image && image.getContext) {
            // A Canvas object
            this._image = null;
            this._canvas = image;
            this._loaded = true;
        } else {
            // A Image object
            this._image = image;
            this._canvas = null;
            this._loaded = !!(image && image.src && image.complete);
        }
        // Both canvas and image have width / height attributes. Due to IE,
        // naturalWidth / Height needs to be checked for a swell, because it
        // apparently can have width / height set to 0 when the image is
        // invisible in the document.
        this._size = new Size(
                image ? image.naturalWidth || image.width : 0,
                image ? image.naturalHeight || image.height : 0);
        this._context = null;
        this._changed(/*#=*/(Change.GEOMETRY | Change.PIXELS));
    },

    /**
     * The Canvas object of the raster. If the raster was created from an image,
     * accessing its canvas causes the raster to try and create one and draw the
     * image into it. Depending on security policies, this might fail, in which
     * case `null` is returned instead.
     *
     * @bean
     * @type HTMLCanvasElement
     */
    getCanvas: function() {
        if (!this._canvas) {
            var ctx = CanvasProvider.getContext(this._size);
            // Since drawImage into canvas might fail based on security policies
            // wrap the call in try-catch and only set _canvas if we succeeded.
            try {
                if (this._image)
                    ctx.drawImage(this._image, 0, 0);
                this._canvas = ctx.canvas;
            } catch (e) {
                CanvasProvider.release(ctx);
            }
        }
        return this._canvas;
    },

    // #setCanvas() is a simple alias to #setImage()
    setCanvas: '#setImage',

    /**
     * The Canvas 2D drawing context of the raster.
     *
     * @bean
     * @type CanvasRenderingContext2D
     */
    getContext: function(_change) {
        if (!this._context)
            this._context = this.getCanvas().getContext('2d');
        // Support a hidden parameter that indicates if the context will be used
        // to change the Raster object. We can notify such changes ahead since
        // they are only used afterwards for redrawing.
        if (_change) {
            // Also set _image to null since the Raster stops representing it.
            // NOTE: This should theoretically be in our own _changed() handler
            // for ChangeFlag.PIXELS, but since it's only happening in one place
            // this is fine:
            this._image = null;
            this._changed(/*#=*/Change.PIXELS);
        }
        return this._context;
    },

    setContext: function(context) {
        this._context = context;
    },

    /**
     * The source of the raster, which can be set using a DOM Image, a Canvas,
     * a data url, a string describing the URL to load the image from, or the
     * ID of a DOM element to get the image from (either a DOM Image or a
     * Canvas). Reading this property will return the url of the source image or
     * a data-url.
     * Note that for consistency, a {@link #onLoad} event will be triggered on
     * the raster even if the image has already finished loading before.
     *
     * @bean
     * @type HTMLImageElement|HTMLCanvasElement|String
     *
     * @example {@paperscript}
     * var raster = new Raster();
     * raster.source = 'http://paperjs.org/about/paper-js.gif';
     * raster.position = view.center;
     *
     * @example {@paperscript}
     * var raster = new Raster({
     *     source: 'http://paperjs.org/about/paper-js.gif',
     *     position: view.center
     * });
     */
    getSource: function() {
        var image = this._image;
        return image && image.src || this.toDataURL();
    },

    setSource: function(src) {
        var image = new self.Image(),
            crossOrigin = this._crossOrigin;
        if (crossOrigin)
            image.crossOrigin = crossOrigin;
        // Prevent setting image source to `null`, as this isn't supported by
        // browsers, and it would actually throw exceptions in JSDOM.
        // TODO: Look into fixing this bug in JSDOM.
        if (src)
            image.src = src;
        this.setImage(image);
    },

    /**
     * The crossOrigin value to be used when loading the image resource, in
     * order to support CORS. Note that this needs to be set before setting the
     * {@link #source} property in order to always work (e.g. when the image is
     * cached in the browser).
     *
     * @bean
     * @type String
     *
     * @example {@paperscript}
     * var raster = new Raster({
     *     crossOrigin: 'anonymous',
     *     source: 'http://assets.paperjs.org/images/marilyn.jpg',
     *     position: view.center
     * });
     *
     * console.log(view.element.toDataURL('image/png').substring(0, 32));
     */
    getCrossOrigin: function() {
        var image = this._image;
        return image && image.crossOrigin || this._crossOrigin || '';
    },

    setCrossOrigin: function(crossOrigin) {
        this._crossOrigin = crossOrigin;
        var image = this._image;
        if (image)
            image.crossOrigin = crossOrigin;
    },

    /**
     * Determines if the raster is drawn with pixel smoothing when scaled up or
     * down, and if so, at which quality its pixels are to be smoothed. The
     * settings of this property control both the `imageSmoothingEnabled` and
     * `imageSmoothingQuality` properties of the `CanvasRenderingContext2D`
     * interface.
     *
     * By default, smoothing is enabled at `'low'` quality. It can be set to of
     * `'off'` to scale the raster's pixels by repeating the nearest neighboring
     * pixels, or to `'low'`, `'medium'` or `'high'` to control the various
     * degrees of available image smoothing quality.
     *
     * For backward compatibility, it can can also be set to `false` (= `'off'`)
     * or `true` (= `'low'`).
     *
     * @bean
     * @type String
     * @default 'low'
     * @values 'low', 'medium', 'high', 'off'
     *
     * @example {@paperscript} var raster = new Raster({source:
     * 'http://assets.paperjs.org/images/marilyn.jpg', smoothing: 'off'
     * });
     * raster.scale(5);
     */
    getSmoothing: function() {
        return this._smoothing;
    },

    setSmoothing: function(smoothing) {
        this._smoothing = typeof smoothing === 'string'
            ? smoothing
            : smoothing ? 'low' : 'off';
        this._changed(/*#=*/Change.ATTRIBUTE);
    },

    // DOCS: document Raster#getElement
    getElement: function() {
        // Only return the internal element if the content is actually ready.
        return this._canvas || this._loaded && this._image;
    }
}, /** @lends Raster# */{
    // Explicitly deactivate the creation of beans, as we have functions here
    // that look like bean getters but actually read arguments.
    // See #getSubCanvas(), #getSubRaster(), #getSubRaster(), #getPixel(),
    // #getImageData()
    beans: false,

    /**
     * Extracts a part of the Raster's content as a sub image, and returns it as
     * a Canvas object.
     *
     * @param {Rectangle} rect the boundaries of the sub image in pixel
     * coordinates
     *
     * @return {HTMLCanvasElement} the sub image as a Canvas object
     */
    getSubCanvas: function(/* rect */) {
        var rect = Rectangle.read(arguments),
            ctx = CanvasProvider.getContext(rect.getSize());
        ctx.drawImage(this.getCanvas(), rect.x, rect.y,
                rect.width, rect.height, 0, 0, rect.width, rect.height);
        return ctx.canvas;
    },

    /**
     * Extracts a part of the raster item's content as a new raster item, placed
     * in exactly the same place as the original content.
     *
     * @param {Rectangle} rect the boundaries of the sub raster in pixel
     * coordinates
     *
     * @return {Raster} the sub raster as a newly created raster item
     */
    getSubRaster: function(/* rect */) {
        var rect = Rectangle.read(arguments),
            raster = new Raster(Item.NO_INSERT);
        raster._setImage(this.getSubCanvas(rect));
        raster.translate(rect.getCenter().subtract(this.getSize().divide(2)));
        raster._matrix.prepend(this._matrix);
        raster.insertAbove(this);
        return raster;
    },

    /**
     * Returns a Base 64 encoded `data:` URL representation of the raster.
     *
     * @return {String}
     */
    toDataURL: function() {
        // See if the linked image is base64 encoded already, if so reuse it,
        // otherwise try using canvas.toDataURL()
        var image = this._image,
            src = image && image.src;
        if (/^data:/.test(src))
            return src;
        var canvas = this.getCanvas();
        return canvas ? canvas.toDataURL.apply(canvas, arguments) : null;
    },

    /**
     * Draws an image on the raster.
     *
     * @param {CanvasImageSource} image
     * @param {Point} point the offset of the image as a point in pixel
     * coordinates
     */
    drawImage: function(image /*, point */) {
        var point = Point.read(arguments, 1);
        this.getContext(true).drawImage(image, point.x, point.y);
    },

    /**
     * Calculates the average color of the image within the given path,
     * rectangle or point. This can be used for creating raster image
     * effects.
     *
     * @param {Path|Rectangle|Point} object
     * @return {Color} the average color contained in the area covered by the
     * specified path, rectangle or point
     */
    getAverageColor: function(object) {
        var bounds, path;
        if (!object) {
            bounds = this.getBounds();
        } else if (object instanceof PathItem) {
            // TODO: What if the path is smaller than 1 px?
            // TODO: How about rounding of bounds.size?
            path = object;
            bounds = object.getBounds();
        } else if (typeof object === 'object') {
            if ('width' in object) {
                bounds = new Rectangle(object);
            } else if ('x' in object) {
                // Create a rectangle of 1px size around the specified point.
                bounds = new Rectangle(object.x - 0.5, object.y - 0.5, 1, 1);
            }
        }
        if (!bounds)
            return null;
        // Use a sample size of max 32 x 32 pixels, into which the path is
        // scaled as a clipping path, and then the actual image is drawn in and
        // sampled.
        var sampleSize = 32,
            width = Math.min(bounds.width, sampleSize),
            height = Math.min(bounds.height, sampleSize);
        // Reuse the same sample context for speed. Memory consumption is low
        // since it's only 32 x 32 pixels.
        var ctx = Raster._sampleContext;
        if (!ctx) {
            ctx = Raster._sampleContext = CanvasProvider.getContext(
                    new Size(sampleSize));
        } else {
            // Clear the sample canvas:
            ctx.clearRect(0, 0, sampleSize + 1, sampleSize + 1);
        }
        ctx.save();
        // Scale the context so that the bounds ends up at the given sample size
        var matrix = new Matrix()
                .scale(width / bounds.width, height / bounds.height)
                .translate(-bounds.x, -bounds.y);
        matrix.applyToContext(ctx);
        // If a path was passed, draw it as a clipping mask:
        // See Project#draw() for an explanation of new Base()
        if (path)
            path.draw(ctx, new Base({ clip: true, matrices: [matrix] }));
        // Now draw the image clipped into it.
        this._matrix.applyToContext(ctx);
        var element = this.getElement(),
            size = this._size;
        if (element)
            ctx.drawImage(element, -size.width / 2, -size.height / 2);
        ctx.restore();
        // Get pixel data from the context and calculate the average color value
        // from it, taking alpha into account.
        var pixels = ctx.getImageData(0.5, 0.5, Math.ceil(width),
                Math.ceil(height)).data,
            channels = [0, 0, 0],
            total = 0;
        for (var i = 0, l = pixels.length; i < l; i += 4) {
            var alpha = pixels[i + 3];
            total += alpha;
            alpha /= 255;
            channels[0] += pixels[i] * alpha;
            channels[1] += pixels[i + 1] * alpha;
            channels[2] += pixels[i + 2] * alpha;
        }
        for (var i = 0; i < 3; i++)
            channels[i] /= total;
        return total ? Color.read(channels) : null;
    },

    /**
     * {@grouptitle Pixels}
     * Gets the color of a pixel in the raster.
     *
     * @name Raster#getPixel
     * @function
     * @param {Number} x the x offset of the pixel in pixel coordinates
     * @param {Number} y the y offset of the pixel in pixel coordinates
     * @return {Color} the color of the pixel
     */
    /**
     * Gets the color of a pixel in the raster.
     *
     * @name Raster#getPixel
     * @function
     * @param {Point} point the offset of the pixel as a point in pixel
     *     coordinates
     * @return {Color} the color of the pixel
     */
    getPixel: function(/* point */) {
        var point = Point.read(arguments);
        var data = this.getContext().getImageData(point.x, point.y, 1, 1).data;
        // Alpha is separate now:
        return new Color('rgb', [data[0] / 255, data[1] / 255, data[2] / 255],
                data[3] / 255);
    },

    /**
     * Sets the color of the specified pixel to the specified color.
     *
     * @name Raster#setPixel
     * @function
     * @param {Number} x the x offset of the pixel in pixel coordinates
     * @param {Number} y the y offset of the pixel in pixel coordinates
     * @param {Color} color the color that the pixel will be set to
     */
    /**
     * Sets the color of the specified pixel to the specified color.
     *
     * @name Raster#setPixel
     * @function
     * @param {Point} point the offset of the pixel as a point in pixel
     *     coordinates
     * @param {Color} color the color that the pixel will be set to
     */
    setPixel: function(/* point, color */) {
        var args = arguments,
            point = Point.read(args),
            color = Color.read(args),
            components = color._convert('rgb'),
            alpha = color._alpha,
            ctx = this.getContext(true),
            imageData = ctx.createImageData(1, 1),
            data = imageData.data;
        data[0] = components[0] * 255;
        data[1] = components[1] * 255;
        data[2] = components[2] * 255;
        data[3] = alpha != null ? alpha * 255 : 255;
        ctx.putImageData(imageData, point.x, point.y);
    },

    /**
     * Clears the image, if it is backed by a canvas.
     */
    clear: function() {
        var size = this._size;
        this.getContext(true).clearRect(0, 0, size.width + 1, size.height + 1);
    },

    // DOCS: document Raster#createImageData
    /**
     * {@grouptitle Image Data}
     * @param {Size} size
     * @return {ImageData}
     */
    createImageData: function(/* size */) {
        var size = Size.read(arguments);
        return this.getContext().createImageData(size.width, size.height);
    },

    // DOCS: document Raster#getImageData
    /**
     * @param {Rectangle} rect
     * @return {ImageData}
     */
    getImageData: function(/* rect */) {
        var rect = Rectangle.read(arguments);
        if (rect.isEmpty())
            rect = new Rectangle(this._size);
        return this.getContext().getImageData(rect.x, rect.y,
                rect.width, rect.height);
    },

    // DOCS: document Raster#putImageData
    /**
     * @param {ImageData} data
     * @param {Point} point
     */
    putImageData: function(data /*, point */) {
        var point = Point.read(arguments, 1);
        this.getContext(true).putImageData(data, point.x, point.y);
    },

    // DOCS: document Raster#setImageData
    /**
     * @param {ImageData} data
     */
    setImageData: function(data) {
        this.setSize(data);
        this.getContext(true).putImageData(data, 0, 0);
    },

    /**
     * {@grouptitle Event Handlers}
     *
     * The event handler function to be called when the underlying image has
     * finished loading and is ready to be used. This is also triggered when
     * the image is already loaded, or when a canvas is used instead of an
     * image.
     *
     * @name Raster#onLoad
     * @property
     * @type ?Function
     *
     * @example
     * var url = 'http://assets.paperjs.org/images/marilyn.jpg';
     * var raster = new Raster(url);
     *
     * // If you create a Raster using a url, you can use the onLoad
     * // handler to do something once it is loaded:
     * raster.onLoad = function() {
     *     console.log('The image has finished loading.');
     * };
     *
     * // As with all events in paper.js, you can also use this notation instead
     * // to install multiple handlers:
     * raster.on('load', function() {
     *     console.log('Now the image is definitely ready.');
     * });
     */

    /**
     *
     * The event handler function to be called when there is an error loading
     * the underlying image.
     *
     * @name Raster#onError
     * @property
     * @type ?Function
     */

    _getBounds: function(matrix, options) {
        var rect = new Rectangle(this._size).setCenter(0, 0);
        return matrix ? matrix._transformBounds(rect) : rect;
    },

    _hitTestSelf: function(point) {
        if (this._contains(point)) {
            var that = this;
            return new HitResult('pixel', that, {
                offset: point.add(that._size.divide(2)).round(),
                // Inject as Straps.js accessor, so #toString renders well too
                color: {
                    get: function() {
                        return that.getPixel(this.offset);
                    }
                }
            });
        }
    },

    _draw: function(ctx, param, viewMatrix) {
        var element = this.getElement();
        // Only draw if image is not empty (#1320).
        if (element && element.width > 0 && element.height > 0) {
            // Handle opacity for Rasters separately from the rest, since
            // Rasters never draw a stroke. See Item#draw().
            ctx.globalAlpha = Numerical.clamp(this._opacity, 0, 1);

            // Call _setStyles() to make sure shadow is drawn (#1437).
            this._setStyles(ctx, param, viewMatrix);

            // `Raster#smoothing` controlls both the `imageSmoothingQuality`
            // and `imageSmoothingEnabled` canvas context properties:
            var smoothing = this._smoothing,
                disabled = smoothing === 'off';
            DomElement.setPrefixed(
                ctx,
                disabled ? 'imageSmoothingEnabled' : 'imageSmoothingQuality',
                disabled ? false : smoothing
            );

            // IRRIS: a big picture on a view is drawn from its screen copies
            // (see Raster.screenCopies). Only a view's draw uses them
            // (param.updateMatrix: Project#draw()), never #rasterize() or an
            // export, and never a raster drawn pixel for pixel (smoothing off).
            var size = this._size,
                copy = param.updateMatrix && !disabled
                    && Raster._screenCopy(this, element, viewMatrix,
                        param.pixelRatio);
            if (copy && copy.width !== element.naturalWidth) {
                // A halved copy, stretched over the picture's own size.
                ctx.drawImage(copy, -size.width / 2, -size.height / 2,
                        element.naturalWidth, element.naturalHeight);
            } else {
                ctx.drawImage(copy || element,
                        -size.width / 2, -size.height / 2);
            }
        }
    },

    _canComposite: function() {
        return true;
    }
}, new function() { // IRRIS: injection scope for the screen copies

    // Screen copies of a big picture (IRRIS, todo 2026-10-10_2/06). A view
    // drew a big <img> (a photo or a plan under the design) at its full size
    // at every redraw, and the browser keeps its decoded pixels only as long
    // as its image cache allows: with little memory (a mid-range PC, Chrome's
    // low-end mode) a 24 - 60 MP picture was decoded again on the main thread
    // at many wheel steps, 0.2 to 2 s each, and zoomed out a plan aliased
    // into dots. Now an <img> of `minPixels` or more is decoded once into a
    // canvas the page holds (its full size), plus copies halved down to
    // `minSide` px. A view draws the smallest copy that still has a pixel per
    // device pixel, and the full size above half size (pixel for pixel what
    // the <img> gives); the <img> itself until they are made, then it is
    // drawn again. None of it holds the main thread long (Chrome 154,
    // measured): the picture is decoded from its file, createImageBitmap(blob),
    // on another thread (createImageBitmap(img) decodes on the main one: 0.5 s
    // for 24 MP on a mid-range PC), copied into its canvas (a PNG a strip per
    // task), and each copy halved from the one before it a strip per task
    // (resizing in one go, createImageBitmap's resize options included, runs
    // on the main thread: 0.15 - 0.45 s). Canvases, not bitmaps: with a
    // graphics card a canvas lives on it, while a bitmap drawn there was sent
    // to it again at every zoom past half size (20 - 70 ms for 24 - 60 MP).
    // The copies are shared by every Raster of the <img> (each Layouts sheet
    // has its own) and made again when its src changes, or when the graphics
    // card lost them. One not drawn for `releaseMs` is closed, except the one
    // drawn last while its raster is still shown, and made again when wanted.
    // A failed build leaves the <img> drawn as before, told once through
    // Raster.screenCopiesFailed(). Raster.screenCopies = null switches it off.
    var entries = [], // an entry per <img> with copies, see getEntry()
        timer = null, // the next sweep(), while copies are held
        SLICE = 1 << 20, // base64 characters decoded a task (4 | SLICE)
        STRIP = 500000, // pixels of a level drawn a task
        vector = /^data:image\/(svg|gif)/i, // an SVG or GIF data URL
        animated = /\.(svg|gif)([?#]|$)/i; // an SVG or GIF file

    // The entry of an <img>: made, and its copies started, at its first draw;
    // made again when its src has changed (the attribute: reading the src
    // property can cost a copy of a data URL in some browsers).
    function getEntry(element, width, height, config) {
        var src = element.getAttribute('src') || '';
        for (var i = 0, l = entries.length; i < l; i++) {
            var entry = entries[i];
            if (entry.element === element) {
                if (entry.src === src)
                    return entry;
                drop(entry);
                break;
            }
        }
        // The full size, then halved while longer than minSide; ratio: the
        // copy's pixels per pixel of the picture (the smaller of the two).
        var levels = [{ width: width, height: height, ratio: 1 }],
            minSide = Math.max(+config.minSide || 0, 1),
            w = width,
            h = height;
        while (Math.max(w, h) > minSide) {
            w = Math.max(1, Math.round(w / 2));
            h = Math.max(1, Math.round(h / 2));
            levels.push({ width: w, height: h,
                    ratio: Math.min(w / width, h / height) });
        }
        entry = { element: element, src: src, levels: levels, views: [],
                ready: false, making: false, failed: false, dropped: false,
                shown: null, raster: null };
        entries.push(entry);
        if (vector.test(src.slice(0, 15)) || !/^data:/.test(src)
                && animated.test(src)) {
            // An SVG is drawn sharp at every size, a GIF may move: drawn as
            // before (a failed entry, without a word).
            entry.failed = true;
        } else {
            build(entry, 0);
            schedule(+config.releaseMs || 0);
        }
        return entry;
    }

    // Makes the missing levels from level `from` on (from 0: the whole
    // picture decoded first), each copy halved from the one before it; then
    // the views that drew the <img> meanwhile (or a copy standing in) are
    // drawn again. The first build, and a rebuild after sweep().
    function build(entry, from) {
        var levels = entry.levels,
            chain;
        entry.making = true;
        try {
            chain = levels[from].image
                    ? Promise.resolve(levels[from].image)
                    : decode(entry.src).then(function(file) {
                        return copy(file.bitmap, levels[0], file.png);
                    }).then(function(image) {
                        return keep(entry, 0, image);
                    });
            for (var i = from + 1, l = levels.length; i < l; i++)
                chain = chain.then(halveTo(entry, i));
        } catch (e) {
            entry.making = false;
            return fail(entry, e);
        }
        chain.then(function() {
            entry.making = false;
            if (!entry.dropped && !entry.failed) {
                entry.ready = true;
                redraw(entry);
            }
        }, function(error) {
            entry.making = false;
            fail(entry, error);
        });
    }

    function halveTo(entry, index) {
        return function(source) {
            var level = entry.levels[index];
            if (entry.dropped || entry.failed)
                throw new Error('no longer wanted');
            // A copy still held stays as it is.
            return level.image || halve(source, level).then(function(image) {
                return keep(entry, index, image);
            });
        };
    }

    // The whole picture, decoded off the main thread from its file; png:
    // whether the file is a PNG (see copy()).
    function decode(src) {
        return fileOf(src).then(function(blob) {
            return self.createImageBitmap(blob).then(function(bitmap) {
                return { bitmap: bitmap, png: blob.type === 'image/png' };
            });
        });
    }

    // The file of a src: a data URL's base64 decoded a slice per task (at
    // once it held the main thread 0.1 s for 24 MP on a mid-range PC), any
    // other URL fetched.
    function fileOf(src) {
        var match = /^data:([^,;]*)[^,]*?(;base64)?,/.exec(src);
        if (!match || !match[2]) {
            return fetch(src).then(function(response) {
                return response.blob();
            });
        }
        var at = match[0].length,
            parts = [];
        return new Promise(function(resolve, reject) {
            function slice() {
                try {
                    var end = Math.min(src.length, at + SLICE),
                        chars = atob(src.slice(at, end)),
                        bytes = new Uint8Array(chars.length);
                    for (var i = 0, l = chars.length; i < l; i++)
                        bytes[i] = chars.charCodeAt(i);
                    parts.push(bytes);
                    at = end;
                    if (at < src.length) {
                        setTimeout(slice, 0);
                    } else {
                        resolve(new Blob(parts, { type: match[1] }));
                    }
                } catch (e) {
                    reject(e);
                }
            }
            setTimeout(slice, 0);
        });
    }

    // A canvas of the level's size.
    function canvasOf(level) {
        var canvas = document.createElement('canvas');
        canvas.width = level.width;
        canvas.height = level.height;
        return canvas;
    }

    // Fills canvas a strip of rows per task (draw(y, next) draws rows y to
    // next, maybe asynchronously), so that the page keeps its frames. What a
    // strip throws rejects the promise (from a timer it would be an uncaught
    // error, a crash for the planner).
    function strips(canvas, draw) {
        var width = canvas.width,
            height = canvas.height,
            rows = Math.max(1, Math.floor(STRIP / width)),
            y = 0;
        return new Promise(function(resolve, reject) {
            function strip() {
                var next = Math.min(height, y + rows);
                new Promise(function(drawn) {
                    drawn(draw(y, next));
                }).then(function() {
                    y = next;
                    if (y < height) {
                        setTimeout(strip, 0);
                    } else {
                        resolve(canvas);
                    }
                }).then(null, reject);
            }
            strip();
        });
    }

    // The decoded picture copied into its canvas pixel for pixel, then the
    // bitmap closed. A PNG (PDF pages and crops come as PNGs, up to 67 MP) a
    // strip per task, each strip cut out of the bitmap first: with a graphics
    // card only that strip goes there at a time (a whole picture: 55 ms for
    // 60 MP on a fast one). Any other file at once, as each strip drawn from
    // the bitmap would send all of it, and Chrome cuts a strip of a photo
    // turned by its EXIF orientation (5 - 8) out of the wrong place.
    function copy(bitmap, level, cut) {
        var canvas = canvasOf(level),
            ctx = canvas.getContext('2d'),
            width = level.width;
        ctx.imageSmoothingEnabled = false;
        if (bitmap.width !== width || bitmap.height !== level.height) {
            release(bitmap);
            return Promise.reject(new Error('a ' + bitmap.width + 'x'
                    + bitmap.height + ' picture for ' + width + 'x'
                    + level.height));
        }
        return (cut ? strips(canvas, function(y, next) {
            return self.createImageBitmap(bitmap, 0, y, width, next - y)
                    .then(function(part) {
                ctx.drawImage(part, 0, y);
                release(part);
            });
        }) : new Promise(function(resolve) {
            ctx.drawImage(bitmap, 0, 0);
            resolve(canvas);
        })).then(function(canvas) {
            release(bitmap);
            return canvas;
        }, function(error) {
            release(bitmap);
            release(canvas);
            throw error;
        });
    }

    // A copy of source at the level's size (clipped strips meet as one
    // drawing would). At exactly half size 'low' smoothing takes the mean of
    // each 2 x 2 pixels, as a browser's own mipmap does.
    function halve(source, level) {
        var canvas = canvasOf(level),
            ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        return strips(canvas, function(y, next) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y, canvas.width, next - y);
            ctx.clip();
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        });
    }

    // A level made goes to its entry, if it still wants it and the size is
    // the level's (a canvas of another size would be drawn wrong).
    function keep(entry, index, image) {
        var level = entry.levels[index];
        if (entry.dropped || entry.failed) {
            release(image);
            throw new Error('no longer wanted');
        }
        if (image.width !== level.width || image.height !== level.height) {
            release(image);
            throw new Error('a ' + image.width + 'x' + image.height
                    + ' copy for ' + level.width + 'x' + level.height);
        }
        release(level.image);
        level.image = image;
        level.used = Date.now();
        return image;
    }

    // A level closed by sweep() and wanted again: made again from the nearest
    // bigger level held, else from the picture's file.
    function remake(entry, index) {
        var levels = entry.levels,
            from = index;
        while (from > 0 && !levels[from].image)
            from--;
        build(entry, from);
    }

    // While a level is made: the nearest one held, a bigger one first.
    function nearest(levels, index) {
        for (var i = index - 1; i >= 0; i--) {
            if (levels[i].image)
                return levels[i];
        }
        for (var j = index + 1, l = levels.length; j < l; j++) {
            if (levels[j].image)
                return levels[j];
        }
        return null;
    }

    // The views that drew the <img> while its copies were made are drawn
    // again, the way Project#_changed() asks for it.
    function redraw(entry) {
        var views = entry.views;
        entry.views = [];
        for (var i = 0, l = views.length; i < l; i++) {
            var view = views[i];
            if (view._project) {
                view._needsUpdate = true;
                if (!view._requested && view._autoUpdate)
                    view.requestUpdate();
            }
        }
    }

    function release(image) {
        if (image) {
            if (image.close) {
                image.close();
            } else {
                // A canvas.
                image.width = image.height = 0;
            }
        }
    }

    // Whether the graphics card lost a level's canvas (its pixels are gone).
    function lost(level) {
        var ctx = level.image.getContext && level.image.getContext('2d');
        return !!(ctx && ctx.isContextLost && ctx.isContextLost());
    }

    function closeAll(entry) {
        var levels = entry.levels;
        for (var i = 0, l = levels.length; i < l; i++) {
            release(levels[i].image);
            levels[i].image = null;
        }
    }

    function drop(entry) {
        entry.dropped = true;
        closeAll(entry);
        entry.views = [];
        entry.shown = entry.raster = null;
        var index = entries.indexOf(entry);
        if (index !== -1)
            entries.splice(index, 1);
    }

    // A failed build: the <img> is drawn as before and the failure told once
    // (the entry stays, so that this src is not tried again).
    function fail(entry, error) {
        if (entry.dropped || entry.failed)
            return;
        entry.failed = true;
        closeAll(entry);
        redraw(entry);
        var hook = Raster.screenCopiesFailed;
        if (hook) {
            try {
                hook('Screen copies of a ' + entry.levels[0].width + 'x'
                        + entry.levels[0].height + ' picture could not be'
                        + ' made, it is drawn as before: '
                        + (error && error.message || error));
            } catch (e) {
                // A failing hook changes nothing here.
            }
        }
    }

    // Whether a raster is still shown: inserted, visible up to its layer, and
    // its view's canvas in the page.
    function isShown(item) {
        var view = item._project && item._project._view;
        if (!view || !item.isInserted() || !view.isVisible())
            return false;
        for (; item; item = item._parent) {
            if (!item._visible)
                return false;
        }
        return true;
    }

    function schedule(delay) {
        if (!timer)
            timer = setTimeout(sweep, Math.max(delay, 0) + 50);
    }

    // Levels not drawn for releaseMs are closed, all of them once switched
    // off; an entry left with none goes, to be made again at its next draw.
    function sweep() {
        timer = null;
        var config = Raster.screenCopies,
            releaseMs = config && +config.releaseMs || 0,
            now = Date.now(),
            next = Infinity;
        for (var i = entries.length - 1; i >= 0; i--) {
            var entry = entries[i];
            if (!config) {
                drop(entry);
                continue;
            }
            if (entry.failed)
                continue;
            if (entry.making) {
                next = Math.min(next, releaseMs);
                continue;
            }
            var levels = entry.levels,
                held = false;
            try {
                var kept = entry.shown && isShown(entry.raster)
                        ? entry.shown : null;
                for (var j = 0, l = levels.length; j < l; j++) {
                    var level = levels[j],
                        idle = now - level.used;
                    if (!level.image)
                        continue;
                    if (level !== kept && idle >= releaseMs) {
                        release(level.image);
                        level.image = null;
                    } else {
                        held = true;
                        next = Math.min(next, level === kept ? releaseMs
                                : releaseMs - idle);
                    }
                }
            } catch (e) {
                // From a timer it would be an uncaught error: the entry goes
                // (made again at its next draw) instead.
                held = false;
            }
            if (!held)
                drop(entry);
        }
        if (next < Infinity)
            schedule(next);
    }

    return {
        statics: {
            /**
             * IRRIS: the screen copies of big pictures (see above): made for
             * an <img> of minPixels or more, halved down to minSide px, closed
             * when not drawn for releaseMs. `null` switches them off.
             *
             * @private
             */
            screenCopies: { minPixels: 4e6, minSide: 1024, releaseMs: 30000 },

            /**
             * IRRIS: told once, with a message, when the screen copies of a
             * picture could not be made (it is drawn as before). By default a
             * soft failure of the planner (window.pseudoErrors).
             *
             * @private
             */
            screenCopiesFailed: function(message) {
                var list = self.pseudoErrors;
                if (list && typeof list.push === 'function')
                    list.push(JSON.stringify({ message: message,
                            time: Date.now() }));
            },

            // The entries, for the checks only.
            _screenCopies: entries,

            /**
             * IRRIS: what a view draws for the <img> element of raster at the
             * matrix (picture to view) and pixel ratio: a held canvas of the
             * picture's full size or smaller, or null for the element.
             *
             * @private
             */
            _screenCopy: function(raster, element, matrix, pixelRatio) {
                var config = Raster.screenCopies;
                // Not a canvas, an <img> loaded, in a browser that can do it.
                if (!config || !matrix || element.getContext
                        || !element.complete || !self.createImageBitmap)
                    return null;
                var width = element.naturalWidth,
                    height = element.naturalHeight,
                    entry = null;
                if (!(width * height >= config.minPixels))
                    return null;
                try {
                    entry = getEntry(element, width, height, config);
                    if (entry.failed)
                        return null;
                    // Device pixels per pixel of the picture: the longer axis
                    // of its matrix on the view, at the view's pixel ratio.
                    var scale = Math.max(
                            Math.sqrt(matrix._a * matrix._a
                                + matrix._b * matrix._b),
                            Math.sqrt(matrix._c * matrix._c
                                + matrix._d * matrix._d))
                            * (pixelRatio || 1),
                        levels = entry.levels,
                        index = 0;
                    // The smallest copy with a pixel per device pixel; the
                    // full size above half size.
                    if (scale <= 0.5) {
                        while (index + 1 < levels.length
                                && levels[index + 1].ratio >= scale)
                            index++;
                    }
                    var level = levels[index],
                        drawn = level.image ? level : null;
                    if (drawn && lost(drawn)) {
                        // Made again from the picture's file; the <img> until
                        // then.
                        drop(entry);
                        entry = getEntry(element, width, height, config);
                        levels = entry.levels;
                        drawn = null;
                    }
                    if (!drawn) {
                        if (entry.ready) {
                            if (!entry.making)
                                remake(entry, index);
                            drawn = nearest(levels, index);
                        }
                        // Drawn again once the level is there.
                        var view = raster._project && raster._project._view;
                        if (view && entry.views.indexOf(view) === -1)
                            entry.views.push(view);
                        if (!drawn)
                            return null;
                    }
                    drawn.used = Date.now();
                    entry.shown = drawn;
                    entry.raster = raster;
                    return drawn.image;
                } catch (e) {
                    if (entry)
                        fail(entry, e);
                    return null;
                }
            }
        }
    };
});
