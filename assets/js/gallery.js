/**
 * GraciaGallery
 *
 * Load-once strategy for both posters and videos:
 *
 *   state.posterCache  Map<slideIndex, HTMLImageElement>
 *     Poster <img> elements are kept alive across navigation.
 *     On revisit, the cached element is reattached instantly — no re-fetch,
 *     no flash, because the image is already in browser memory.
 *
 *   state.videoCache   Map<slideIndex, HTMLVideoElement>
 *     <video> elements are kept alive (src / partial buffer intact).
 *     On revisit, the cached element is reattached — no new HTTP request.
 *
 *   state.playBtn      Single permanent <div.gallery-play-btn> per tile.
 *     Created once on first poster load, never removed.
 *
 * Poster preloading is triggered by IntersectionObserver when the gallery
 * slide scrolls into view, before the card is opened.
 *
 * Video source:
 *   data-vimeo="/slug"  → https://archive.org/download/campgaleria/slug.mp4
 *   data-src="/url"     → used directly
 */

( function () {
    'use strict';

    const ARCHIVE_BASE       = 'https://archive.org/download/campgaleria';
    const PRELOAD_STAGGER_MS = 60;

    const ARROW_LEFT  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 41.5"><path fill="#f5f5f5" d="M0,20.4c0-.3.1-.6.3-.8L14.6.5c.4-.6,1.3-.7,1.9-.2.6.4.7,1.3.3,1.9L3,20.5l13.7,18.8c.4.6.3,1.4-.3,1.9-.6.4-1.4.3-1.9-.3L.2,21.2c-.1-.2-.2-.5-.2-.8Z"/></svg>';
    const ARROW_RIGHT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 41.5"><path fill="#f5f5f5" d="M17,20.4c0-.3-.1-.6-.3-.8L2.4.5C2,0,1.1-.2.5.3,0,.7-.2,1.6.2,2.2l13.8,18.3L.3,39.3c-.4.6-.3,1.4.3,1.9.6.4,1.4.3,1.9-.3l14.3-19.7c.1-.2.2-.5.2-.8Z"/></svg>';

    const PLAY_ICON_URL = ( window.graciaGalleryConfig && window.graciaGalleryConfig.playIconUrl )
        ? window.graciaGalleryConfig.playIconUrl
        : '';

    class GraciaGallery {

        constructor() {
            this._container = document.querySelector( '.gallery-tiles' );
            if ( ! this._container ) {
                return;
            }

            this._tiles      = Array.from( this._container.querySelectorAll( '.gallery-tile' ) );
            this._tileStates = this._tiles.map( ( tile ) => ( {
                slides:       this._readSlides( tile ),
                currentIndex: 0,
                posterCache:  new Map(), // Map<slideIndex, HTMLImageElement>
                videoCache:   new Map(), // Map<slideIndex, HTMLVideoElement>
                playBtn:      null,      // single permanent element per tile
            } ) );

            this._cardIsOpen = false;
            this._slide      = this._container.closest( '.gracia-slide' );
            this._preloadBin = this._createPreloadBin();

            this._injectArrowIcons();
            this._setupTileClicks();
            this._setupNavigation();
            this._hideSingleSlideArrows();
            this._observeSlideVisibility();
            this._observeCardState();
        }

        /* ------------------------------------------------------------------ */
        /* Preload bin — off-screen DOM node that keeps eager videos alive     */
        /* Browsers only buffer <video> elements that are attached to the DOM. */
        /* ------------------------------------------------------------------ */

        _createPreloadBin() {
            const bin = document.createElement( 'div' );
            bin.setAttribute( 'aria-hidden', 'true' );
            bin.style.cssText = [
                'position:fixed',
                'left:-9999px',
                'top:-9999px',
                'width:1px',
                'height:1px',
                'overflow:hidden',
                'opacity:0',
                'pointer-events:none',
            ].join( ';' );
            document.body.appendChild( bin );
            return bin;
        }

        /* ------------------------------------------------------------------ */
        /* Data reading                                                         */
        /* ------------------------------------------------------------------ */

        _readSlides( tile ) {
            return Array.from( tile.querySelectorAll( '.gallery-slide' ) ).map( ( el ) => ( {
                vimeo: ( el.dataset.vimeo || '' ).trim(),
                src:   ( el.dataset.src   || '' ).trim(),
            } ) ).filter( ( s ) => s.vimeo || s.src );
        }

        /* ------------------------------------------------------------------ */
        /* URL resolution                                                       */
        /* ------------------------------------------------------------------ */

        _resolveVideoSrc( slide ) {
            return slide.src || ( ARCHIVE_BASE + slide.vimeo + '.mp4' );
        }

        _resolvePosterSrc( slide ) {
            return slide.vimeo ? ARCHIVE_BASE + slide.vimeo + '.jpg' : '';
        }

        /* ------------------------------------------------------------------ */
        /* Arrow SVG injection                                                  */
        /* ------------------------------------------------------------------ */

        _injectArrowIcons() {
            this._tiles.forEach( ( tile ) => {
                const prev = tile.querySelector( '.gallery-prev' );
                const next = tile.querySelector( '.gallery-next' );
                if ( prev ) { prev.innerHTML = ARROW_LEFT; }
                if ( next ) { next.innerHTML = ARROW_RIGHT; }
            } );
        }

        /* ------------------------------------------------------------------ */
        /* Trigger A — preload posters when gallery slide scrolls into view    */
        /* ------------------------------------------------------------------ */

        _observeSlideVisibility() {
            if ( ! this._slide ) { return; }

            const io = new IntersectionObserver( ( entries ) => {
                if ( entries[ 0 ].isIntersecting ) {
                    this._preloadAllPosters();
                    /* Preload the first video of every tile while the slide is
                       visible but before the card opens, so clicking plays
                       instantly without waiting for any buffering. */
                    this._tiles.forEach( ( _, i ) => this._eagerPreloadSlide( i, 0 ) );
                    io.disconnect();
                }
            }, { threshold: 0.3 } );

            io.observe( this._slide );
        }

        /* ------------------------------------------------------------------ */
        /* Card state                                                           */
        /* ------------------------------------------------------------------ */

        _observeCardState() {
            if ( ! this._slide ) { return; }

            const observer = new MutationObserver( () => {
                if ( this._slide.classList.contains( 'opened' ) ) {
                    this._onCardOpen();
                } else if ( this._cardIsOpen ) {
                    this._onCardClose();
                }
            } );

            observer.observe( this._slide, { attributeFilter: [ 'class' ] } );
        }

        _onCardOpen() {
            this._cardIsOpen = true;
            this._preloadAllPosters();
            this._container.classList.add( 'is-visible' );

            /* Preload the next slide of every tile so the first navigation
               within any carousel is instant. */
            this._tiles.forEach( ( _, i ) => this._preloadAdjacentSlides( i ) );
        }

        _onCardClose() {
            this._cardIsOpen = false;
            this._container.classList.remove( 'is-visible' );
            this._detachAllVideos();
        }

        /* ------------------------------------------------------------------ */
        /* Phase 1 — poster preloading (load-once, cache-on-navigate)          */
        /* ------------------------------------------------------------------ */

        _preloadAllPosters() {
            this._tileStates.forEach( ( state, index ) => {
                /* Skip if a poster is already in the tile DOM */
                if ( this._tiles[ index ].querySelector( '.gallery-poster' ) ) {
                    return;
                }
                setTimeout( () => {
                    this._loadPoster( index );
                }, index * PRELOAD_STAGGER_MS );
            } );
        }

        _loadPoster( tileIndex ) {
            const tile  = this._tiles[ tileIndex ];
            const state = this._tileStates[ tileIndex ];

            if ( ! tile || ! state || ! state.slides.length ) { return; }

            const index = state.currentIndex;

            /* Ensure the permanent play button exists (created once per tile) */
            if ( ! state.playBtn ) {
                state.playBtn = this._createPlayBtn();
                tile.appendChild( state.playBtn );
            }

            if ( state.posterCache.has( index ) ) {
                /* Reattach cached element — already loaded, instant, no flash */
                const img = state.posterCache.get( index );
                tile.insertBefore( img, tile.firstChild );
                tile.classList.add( 'has-poster' );
                return;
            }

            /* First visit for this slide — fetch the poster image */
            const slide     = state.slides[ index ];
            const posterSrc = this._resolvePosterSrc( slide );

            const img     = document.createElement( 'img' );
            img.className = 'gallery-poster';
            img.alt       = '';
            img.decoding  = 'async';

            state.posterCache.set( index, img );

            const onReady = () => tile.classList.add( 'has-poster' );

            if ( posterSrc ) {
                img.onload  = onReady;
                img.onerror = onReady;
                img.src     = posterSrc;
            } else {
                onReady();
            }

            tile.insertBefore( img, tile.firstChild );
        }

        _createPlayBtn() {
            const btn     = document.createElement( 'div' );
            btn.className = 'gallery-play-btn';

            if ( PLAY_ICON_URL ) {
                const icon = document.createElement( 'img' );
                icon.src   = PLAY_ICON_URL;
                icon.alt   = '';
                icon.width = 90;
                btn.appendChild( icon );
            }

            return btn;
        }

        /* ------------------------------------------------------------------ */
        /* Phase 2 — video: get from cache or create, then play                */
        /* ------------------------------------------------------------------ */

        _activateVideoAndPlay( tileIndex ) {
            const tile  = this._tiles[ tileIndex ];
            const state = this._tileStates[ tileIndex ];

            if ( ! tile || ! state || ! state.slides.length ) { return; }

            this._detachWrap( tile );

            const index = state.currentIndex;
            let video;

            if ( state.videoCache.has( index ) ) {
                video = state.videoCache.get( index );
            } else {
                video = this._createVideoEl( state.slides[ index ] );
                state.videoCache.set( index, video );
            }

            const wrap     = document.createElement( 'div' );
            wrap.className = 'gallery-video-wrap';
            /* appendChild moves the element in one DOM operation — no detach step.
               Detaching first (removeChild) can cause browsers to abort buffering. */
            wrap.appendChild( video );

            /* Insert before play button so play button stays on top */
            if ( state.playBtn ) {
                tile.insertBefore( wrap, state.playBtn );
            } else {
                tile.appendChild( wrap );
            }

            requestAnimationFrame( () => wrap.classList.add( 'is-loaded' ) );

            this._pauseAllExcept( tile );
            /* Only seek to start if the video has been played before.
               Setting currentTime on a freshly preloaded video (currentTime === 0)
               triggers a seek that aborts the buffered data and causes a reload delay. */
            if ( video.currentTime > 0 ) {
                video.currentTime = 0;
            }
            /* Add is-playing immediately so UI feedback is instant.
               Remove it only if play() is actually rejected (e.g. autoplay blocked). */
            tile.classList.add( 'is-playing' );
            video.play().catch( () => {
                tile.classList.remove( 'is-playing' );
            } );

            /* Once this video is playing, buffer the prev/next slides in this tile */
            this._preloadAdjacentSlides( tileIndex );
        }

        _handleTileClick( tileIndex ) {
            const tile  = this._tiles[ tileIndex ];
            const state = this._tileStates[ tileIndex ];

            if ( ! tile || ! state || ! state.slides.length ) { return; }

            const wrap = tile.querySelector( '.gallery-video-wrap' );
            if ( wrap ) {
                const video = wrap.querySelector( 'video' );
                if ( video ) { this._togglePlay( tile, video ); }
                return;
            }

            this._activateVideoAndPlay( tileIndex );
        }

        _createVideoEl( slide ) {
            const video       = document.createElement( 'video' );
            video.loop        = true;
            video.muted       = false;
            video.playsInline = true;
            video.preload     = 'none';

            const posterSrc = this._resolvePosterSrc( slide );
            if ( posterSrc ) { video.poster = posterSrc; }

            const source  = document.createElement( 'source' );
            source.src    = this._resolveVideoSrc( slide );
            source.type   = 'video/mp4';
            video.appendChild( source );

            video.addEventListener( 'ended', () => {
                const t = video.closest( '.gallery-tile' );
                if ( t ) { t.classList.remove( 'is-playing' ); }
            } );

            return video;
        }

        /* ------------------------------------------------------------------ */
        /* Adjacent-slide preloading — within the same tile's carousel        */
        /* ------------------------------------------------------------------ */

        /* Buffer a specific slide (by index) for a given tile.
           The video element lives in _preloadBin so the browser actively
           downloads data; it is moved into the wrap when the user plays it. */
        _eagerPreloadSlide( tileIndex, slideIndex ) {
            const state = this._tileStates[ tileIndex ];
            if ( ! state ) { return; }

            const slide = state.slides[ slideIndex ];
            if ( ! slide ) { return; }

            if ( state.videoCache.has( slideIndex ) ) { return; }

            const video   = this._createVideoEl( slide );
            video.preload = 'auto';
            this._preloadBin.appendChild( video );
            video.load();
            state.videoCache.set( slideIndex, video );
        }

        /* Preload the slide immediately before and after the current one. */
        _preloadAdjacentSlides( tileIndex ) {
            const state = this._tileStates[ tileIndex ];
            if ( ! state || state.slides.length <= 1 ) { return; }

            const current = state.currentIndex;
            const count   = state.slides.length;

            this._eagerPreloadSlide( tileIndex, ( current + 1 ) % count );
            this._eagerPreloadSlide( tileIndex, ( current - 1 + count ) % count );
        }

        /* ------------------------------------------------------------------ */
        /* Play / pause                                                         */
        /* ------------------------------------------------------------------ */

        _togglePlay( tile, video ) {
            if ( video.paused ) {
                this._pauseAllExcept( tile );
                video.play().catch( () => {} );
                tile.classList.add( 'is-playing' );
            } else {
                video.pause();
                tile.classList.remove( 'is-playing' );
            }
        }

        _pauseAllExcept( exceptTile ) {
            this._tiles.forEach( ( tile ) => {
                if ( tile === exceptTile ) { return; }
                const video = tile.querySelector( 'video' );
                if ( video && ! video.paused ) {
                    video.pause();
                    tile.classList.remove( 'is-playing' );
                }
            } );
        }

        /* ------------------------------------------------------------------ */
        /* Detach helpers — remove from DOM, keep alive in cache               */
        /* ------------------------------------------------------------------ */

        _detachWrap( tile ) {
            const wrap = tile.querySelector( '.gallery-video-wrap' );
            if ( ! wrap ) { return; }
            const video = wrap.querySelector( 'video' );
            if ( video ) {
                video.pause();
                /* Do NOT clear src — preserve buffer for cache reuse */
            }
            wrap.remove();
        }

        _detachAllVideos() {
            this._tiles.forEach( ( tile ) => {
                this._detachWrap( tile );
                tile.classList.remove( 'is-playing' );
            } );
        }

        /* ------------------------------------------------------------------ */
        /* Navigation — prev / next (autoplays, uses both caches on revisit)   */
        /* ------------------------------------------------------------------ */

        /* Bind a tap/click handler for both touch and pointer devices.
         *
         * touch-action:manipulation on the elements (gallery.css) tells the
         * browser to fire click immediately on first tap — no 300ms delay,
         * no first-tap-hover-only behaviour on iOS. A plain click listener is
         * therefore sufficient and avoids the fragility of manual touchend
         * handling inside a scrollable container.
         */
        _bindTap( element, handler ) {
            element.addEventListener( 'click', ( e ) => {
                e.stopPropagation();
                handler();
            } );
        }

        _setupTileClicks() {
            this._tiles.forEach( ( tile, tileIndex ) => {
                this._bindTap( tile, () => this._handleTileClick( tileIndex ) );
            } );
        }

        _setupNavigation() {
            this._tiles.forEach( ( tile, tileIndex ) => {
                const prevBtn = tile.querySelector( '.gallery-prev' );
                const nextBtn = tile.querySelector( '.gallery-next' );

                if ( prevBtn ) {
                    this._bindTap( prevBtn, () => this._navigate( tileIndex, -1 ) );
                }

                if ( nextBtn ) {
                    this._bindTap( nextBtn, () => this._navigate( tileIndex, 1 ) );
                }
            } );
        }

        _navigate( tileIndex, direction ) {
            const state = this._tileStates[ tileIndex ];
            if ( ! state || state.slides.length <= 1 ) { return; }

            const tile = this._tiles[ tileIndex ];

            /* Detach video wrap without clearing src */
            this._detachWrap( tile );

            /* Detach current poster — stays alive in posterCache */
            const oldPoster = tile.querySelector( '.gallery-poster' );
            if ( oldPoster ) { oldPoster.remove(); }
            tile.classList.remove( 'has-poster', 'is-playing' );

            state.currentIndex = ( state.currentIndex + direction + state.slides.length ) % state.slides.length;

            /* Reattach from cache (instant) or fetch new poster */
            this._loadPoster( tileIndex );

            /* Autoplay — reattach from videoCache or create new */
            this._activateVideoAndPlay( tileIndex );
        }

        /* ------------------------------------------------------------------ */
        /* Hide arrows for single-video tiles                                  */
        /* ------------------------------------------------------------------ */

        _hideSingleSlideArrows() {
            this._tiles.forEach( ( tile, index ) => {
                const state = this._tileStates[ index ];
                if ( ! state || state.slides.length <= 1 ) {
                    const prevBtn = tile.querySelector( '.gallery-prev' );
                    const nextBtn = tile.querySelector( '.gallery-next' );
                    if ( prevBtn ) { prevBtn.classList.add( 'is-hidden' ); }
                    if ( nextBtn ) { nextBtn.classList.add( 'is-hidden' ); }
                }
            } );
        }
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', () => {
            window.graciaGallery = new GraciaGallery();
        } );
    } else {
        window.graciaGallery = new GraciaGallery();
    }

} )();
