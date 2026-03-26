/**
 * Gracia Homepage Navigation
 *
 * Manages the full-screen vertical slider on the homepage:
 *  - Progressive image loading (low-res → high-res swap)
 *  - Video background detection via .homepage-video-background
 *  - Burger menu construction from slide data
 *  - Slide scrolling and card open/close
 *  - Cursor hints and post content hints
 *  - Safari browser warning
 *  - Mobile landscape orientation warning
 *  - Keyboard and hash-based navigation
 */

'use strict';

class Navigation {

    constructor() {
        this.slider        = document.getElementById( 'gracia-slides' );
        this.slides        = this.slider ? this.slider.querySelectorAll( '.gracia-slide' ) : [];
        this.body          = document.body;
        this.offcanvas     = document.getElementById( 'offcanvas' );
        this.burgerTrigger = document.querySelector( 'button.ct-header-trigger.ct-toggle' );

        // Blocksy marks #offcanvas as inert and aria-hidden by default.
        // Remove both immediately so JS interaction works before the menu ever opens.
        if ( this.offcanvas ) {
            this.offcanvas.inert = false;
            this.offcanvas.removeAttribute( 'aria-hidden' );
        }

        this.cardOpened      = false;
        this.targetSlide     = null;
        this.isScrolling     = false;
        this.slideIndexMap   = {};

        // Hint tracking (per session)
        this.cursorHintShown  = new Set();
        this.contentHintShown = new Set();
        this.activeCursorHint = null;
        this.activeTextHints  = new Set();

        // Pending hint timers
        this.pendingCursorHintTimer  = null;
        this.pendingContentHintTimer = null;

        // User scroll detection (suppresses hints during scroll)
        this.isUserScrolling = false;
        this.scrollTimer     = null;

        this.lang = this.detectLanguage();

        // Bound touchmove handler used to block slider scroll on mobile while
        // a card is open. Stored on the instance so the same reference is used
        // for both addEventListener and removeEventListener.
        this._blockSliderTouch = ( e ) => {
            // Allow touch-scroll inside the card content scroll container.
            if ( e.target.closest( '.gracia-slide-scroll' ) ) return;
            e.preventDefault();
        };

        // Bound handler that blocks pinch-to-zoom (two-finger gestures).
        // Stored on the instance so the reference is stable for removeEventListener.
        this._preventPinchZoom = ( e ) => {
            if ( e.touches.length > 1 ) {
                e.preventDefault();
            }
        };

        this.init();
    }

    // =========================================================================
    // Initialisation
    // =========================================================================

    init() {
        if ( ! this.slider || this.slides.length === 0 ) {
            return;
        }

        // Wire the burger immediately — before any async image loading.
        // Camp.mx does the same: replaceDefaultBurgerFunction() is called in init()
        // at the very start, not buried inside a callback. This guarantees a click
        // always reaches our handler even if image loading is slow or errors out.
        if ( this.burgerTrigger ) {
            this.replaceDefaultBurgerFunction();
        }

        this.showSpinner();
        this.showSafariWarningIfNeeded();

        if ( this.checkDirectUrlVisit() ) {
            this.skipLowResImages();
        }

        this.loadBackgroundImages( () => {
            this.hideSpinner();
            this.completeInitialization();
        } );
    }

    completeInitialization() {
        this.initVideoBackgrounds();
        this.menuConstruct();
        this.letsListen();
        this.initScrollHints();
        this.initArrowKeyNavigation();
        this.initEscapeKey();
        this.initHashChangeListener();
        this.initMobileLandscapeWarning();
        this.applyMobileLabelOverrides();
        this.initPinchZoomPrevention();

        // Handle direct URL visit after everything is ready
        const hash = window.location.hash.replace( '#', '' ).trim();
        if ( hash ) {
            setTimeout( () => {
                this.gotoSlide( { divId: hash, openTheCard: true } );
            }, 300 );
        }
    }

    // =========================================================================
    // Loading spinner
    // =========================================================================

    showSpinner() {
        const spinner = document.getElementById( 'gracia-loading-spinner' );
        if ( spinner ) {
            this.body.classList.add( 'gracia-loading' );
            spinner.style.pointerEvents = 'auto';
        }
    }

    hideSpinner() {
        const spinner = document.getElementById( 'gracia-loading-spinner' );
        if ( ! spinner ) return;

        spinner.style.opacity = '0';
        spinner.style.transition = 'opacity 0.5s ease-out';
        this.body.classList.remove( 'gracia-loading' );

        setTimeout( () => {
            if ( spinner.parentNode ) {
                spinner.parentNode.removeChild( spinner );
            }
        }, 600 );
    }

    // =========================================================================
    // Progressive image loading
    // =========================================================================

    loadBackgroundImages( callback ) {
        const promises = [];

        this.slides.forEach( slide => {
            const highResUrl = slide.dataset.bgHighRes;
            if ( ! highResUrl ) return;

            promises.push( new Promise( resolve => {
                const img = new Image();
                img.onload  = () => {
                    slide.style.backgroundImage = `url('${ highResUrl }')`;
                    resolve();
                };
                img.onerror = () => resolve(); // don't block on error
                img.src = highResUrl;
            } ) );
        } );

        // Resolve after all images load, or after 8 seconds max
        const timeout = new Promise( resolve => setTimeout( resolve, 8000 ) );
        Promise.race( [ Promise.all( promises ), timeout ] )
            .then( () => callback() )
            .catch( () => callback() );
    }

    skipLowResImages() {
        this.slides.forEach( slide => {
            const highRes = slide.dataset.bgHighRes;
            if ( highRes ) {
                slide.style.backgroundImage = `url('${ highRes }')`;
            }
        } );
    }

    // =========================================================================
    // Video backgrounds
    // =========================================================================

    /**
     * For each slide that contains a .homepage-video-background element,
     * replace the CSS background image with an autoplaying muted video.
     */
    initVideoBackgrounds() {
        this.slides.forEach( slide => {
            const videoDef = slide.querySelector( '.homepage-video-background' );
            if ( ! videoDef ) return;

            const videoUrl = videoDef.dataset.videoUrl;
            if ( ! videoUrl ) return;

            // Remove the background image
            slide.style.backgroundImage = 'none';
            slide.classList.add( 'has-video-bg' );

            const video = document.createElement( 'video' );
            video.src         = videoUrl;
            video.autoplay    = true;
            video.muted       = true;
            video.loop        = true;
            video.playsInline = true;
            video.className   = 'gracia-video-bg';

            const bgLayer = slide.querySelector( '.gracia-slide-bg' );
            if ( bgLayer ) {
                bgLayer.appendChild( video );
            } else {
                slide.prepend( video );
            }

            // Hide the definition element (it's just a data carrier)
            videoDef.style.display = 'none';
        } );
    }

    // =========================================================================
    // Burger menu construction
    // =========================================================================

    menuConstruct() {
        // Build the menu overlay as its own fixed-position element appended to
        // document.body — completely outside Blocksy's #offcanvas DOM tree.
        // This avoids every Blocksy CSS specificity issue with right-side panels.
        this.menuOverlay = document.createElement( 'div' );
        this.menuOverlay.id = 'gracia-menu-overlay';

        const list = document.createElement( 'ul' );

        this.slides.forEach( ( slide, index ) => {
            const title  = slide.dataset.title;
            const postId = slide.dataset.post;
            const divId  = slide.id;

            if ( ! title || ! divId ) return;

            this.slideIndexMap[ index ] = { index, id: divId };

            const li   = document.createElement( 'li' );
            const item = document.createElement( 'p' );
            item.className    = 'gracia-menu-item';
            item.dataset.post = postId;
            item.textContent  = title;

            item.addEventListener( 'click', async ( e ) => {
                e.preventDefault();
                e.stopPropagation();
                await this.deactivateMenu();
                this.gotoSlide( { divId, openTheCard: false } );
            } );

            li.appendChild( item );
            list.appendChild( li );

            // Caret click navigation
            const caret = slide.querySelector( '.gracia-caret' );
            if ( caret ) {
                const targetId = caret.dataset.targetSlide;
                caret.addEventListener( 'click', ( e ) => {
                    e.preventDefault();
                    e.stopPropagation(); // prevent click bubbling to slide → openCard()
                    this.gotoSlide( { divId: targetId, openTheCard: false } );
                } );
            }
        } );

        this.menuOverlay.appendChild( list );
        document.body.appendChild( this.menuOverlay );

        // Clicking on the overlay background (not on a menu item) closes the menu.
        this.menuOverlay.addEventListener( 'click', ( e ) => {
            if ( e.target === this.menuOverlay ) {
                this.deactivateMenu();
            }
        } );
    }

    // =========================================================================
    // Menu open / close
    // =========================================================================

    toggleMenu() {
        if ( this.menuOpened ) {
            // Burger explicitly clicked to close — bypass the just-opened debounce.
            this._menuJustOpened = false;
            this.deactivateMenu();
        } else {
            this.activateMenu();
        }
    }

    activateMenu() {
        if ( ! this.menuOverlay ) return;

        if ( this.cardOpened ) {
            this.closeCards();
        }

        this.menuOverlay.classList.remove( 'menu-closing' );

        if ( this.slider ) {
            this.slider.classList.add( 'menuactive' );
        }
        this.body.style.overflow = 'hidden';

        this.menuOverlay.classList.add( 'active' );
        this.body.classList.add( 'menu-open' );
        this.menuOpened = true;

        this._menuJustOpened = true;
        setTimeout( () => { this._menuJustOpened = false; }, 150 );
    }

    async deactivateMenu() {
        if ( ! this.menuOverlay ) return;
        if ( this._menuJustOpened ) return;

        this.menuOpened = false;

        // Phase 1: play item exit animation (0.2s).
        // .menu-closing triggers gracia-menu-out with fill-mode: forwards,
        // so items end at opacity:0 and stay there.
        this.menuOverlay.classList.add( 'menu-closing' );
        await new Promise( resolve => setTimeout( resolve, 220 ) );

        if ( this.menuOpened ) return;

        // Phase 2: remove .active to trigger the overlay's own opacity
        // transition (0.2s). Keep .menu-closing so items remain at opacity:0
        // during this fade — prevents the flash/hiccup.
        this.menuOverlay.classList.remove( 'active' );
        this.body.classList.remove( 'menu-open' );

        if ( this.slider ) {
            this.slider.classList.remove( 'menuactive' );
        }
        this.body.style.overflow = '';

        // Phase 3: after overlay transition completes, clean up .menu-closing.
        await new Promise( resolve => setTimeout( resolve, 220 ) );
        if ( ! this.menuOpened ) {
            this.menuOverlay.classList.remove( 'menu-closing' );
        }
    }

    replaceDefaultBurgerFunction() {
        // Clone to remove Blocksy's directly-attached event listeners.
        const clone = this.burgerTrigger.cloneNode( true );

        // Remove Blocksy's data-toggle-panel and aria-controls attributes.
        // Blocksy uses document-level event delegation that fires for any element
        // with [data-toggle-panel], even on a clone. Without removing this attribute
        // Blocksy's handler fights with ours every click, causing the menu to flash
        // open and immediately close. Camp.mx does the same (navigation-v3_0.js line 1535).
        clone.removeAttribute( 'data-toggle-panel' );
        clone.removeAttribute( 'aria-controls' );

        this.burgerTrigger.parentNode.replaceChild( clone, this.burgerTrigger );
        this.burgerTrigger = clone;

        this.burgerTrigger.addEventListener( 'click', ( e ) => {
            e.stopPropagation();
            this.toggleMenu();
        } );
    }

    // =========================================================================
    // Slide click listeners
    // =========================================================================

    letsListen() {
        this.slides.forEach( slide => {
            slide.addEventListener( 'click', ( e ) => {
                if ( this.menuOpened ) {
                    this.deactivateMenu();
                    return;
                }

                if ( slide.classList.contains( 'opened' ) ) {
                    // Clicking outside the card content closes it.
                    // The slide label (title + caret) is intentionally NOT excluded —
                    // clicking it should also close the card.
                    if ( ! e.target.closest( '.gracia-card' ) ) {
                        this.closeCards();
                    }
                    return;
                }

                this.openCard( { divId: slide.id, post: slide.dataset.post } );
            } );

            // Tap areas inside card close the card
            const tapAreas = slide.querySelectorAll( '.gracia-tap-top, .gracia-tap-left, .gracia-tap-right, .gracia-tap-bottom' );
            tapAreas.forEach( area => {
                area.addEventListener( 'click', ( e ) => {
                    e.stopPropagation();
                    this.closeCards();
                } );
            } );
        } );

        // Click outside slides closes cards
        document.addEventListener( 'click', ( e ) => {
            if ( this.cardOpened && ! e.target.closest( '.gracia-slide.opened' ) ) {
                this.closeCards();
            }
        } );
    }

    // =========================================================================
    // Slide navigation
    // =========================================================================

    gotoSlide( obj ) {
        this.cancelPendingHints();
        this.hideCurrentCursorHint();
        this.hideAllActiveTextHints();

        const { divId, openTheCard = false } = obj;
        const element = document.getElementById( divId );

        if ( ! element ) {
            console.warn( '[gracia] gotoSlide: element not found:', divId );
            return;
        }

        history.replaceState( null, '', window.location.pathname + window.location.search );

        const rect          = element.getBoundingClientRect();
        const isInView      = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if ( isInView ) {
            if ( openTheCard ) {
                this.openCard( obj );
            } else {
                this.showCursorHint( element );
            }
            return;
        }

        this.isScrolling = true;
        element.scrollIntoView( { behavior: 'smooth', block: 'start' } );

        const onScroll = () => {
            const r = element.getBoundingClientRect();
            if ( r.top >= 0 && r.bottom <= window.innerHeight ) {
                this.isScrolling = false;
                this.slider.removeEventListener( 'scroll', onScroll );

                if ( openTheCard ) {
                    this.openCard( obj );
                } else {
                    setTimeout( () => {
                        if ( ! element.classList.contains( 'opened' ) ) {
                            this.showCursorHint( element );
                        }
                    }, 200 );
                }
            }
        };

        this.slider.addEventListener( 'scroll', onScroll );
    }

    // =========================================================================
    // Card open / close
    // =========================================================================

    openCard( obj ) {
        const { divId } = obj;
        const slide = document.getElementById( divId );
        if ( ! slide ) return;

        // Close any already-open card first
        if ( this.cardOpened ) {
            this.closeCards();
        }

        slide.classList.remove( 'closed' );
        slide.classList.add( 'opened' );
        this.body.classList.add( 'card-open' );
        this.cardOpened  = true;
        this.targetSlide = divId;

        // On iOS Safari, overflow:hidden on #gracia-slides does not stop
        // in-progress touch scroll. Block touchmove at the event level so
        // the background slides cannot scroll while a card is open.
        // { passive: false } is required to allow preventDefault().
        if ( this.slider ) {
            this.slider.addEventListener( 'touchmove', this._blockSliderTouch, { passive: false } );
        }

        this.cancelPendingHints();
        this.hideCurrentCursorHint();

        this.schedulePostContentHint( slide );
    }

    closeCards() {
        // Mark logical state closed immediately so subsequent taps are not blocked.
        this.cardOpened  = false;
        this.targetSlide = null;

        if ( this.slider ) {
            this.slider.removeEventListener( 'touchmove', this._blockSliderTouch );
        }

        this.cancelPendingHints();
        this.hideAllActiveTextHints();

        /*
         * Two-phase close:
         *   Phase 1 — add .closing to play CSS fade-out (gracia-fade-out 0.2s).
         *             body.card-open stays set so #gracia-slides remains
         *             overflow:hidden; this prevents the outer slider and inner
         *             card scroll from fighting each other during the transition.
         *   Phase 2 — after the animation completes, remove .opened + .closing,
         *             add .closed, and finally release the body.card-open lock.
         *
         * FADE_OUT_MS must match the gracia-fade-out duration in homepage.css.
         */
        const FADE_OUT_MS = 200;
        let anyClosing = false;

        this.slides.forEach( slide => {
            if ( slide.classList.contains( 'opened' ) ) {
                anyClosing = true;
                slide.classList.add( 'closing' );
                setTimeout( () => {
                    slide.classList.remove( 'opened', 'closing' );
                    slide.classList.add( 'closed' );
                    this.body.classList.remove( 'card-open' );
                }, FADE_OUT_MS );
            }
        } );

        // Edge case: closeCards() called when no slide was open.
        if ( !anyClosing ) {
            this.body.classList.remove( 'card-open' );
        }
    }

    // =========================================================================
    // Cursor hint
    // =========================================================================

    showCursorHint( slideElement ) {
        return; // cursor click hint disabled

        const slideId = slideElement.id;

        if ( this.cursorHintShown.has( slideId ) ) return;
        if ( this.isUserScrolling ) return;
        if ( slideElement.classList.contains( 'opened' ) ) return;

        this.hideCurrentCursorHint();

        const hint = document.createElement( 'div' );
        hint.className = 'gracia-cursor-hint';
        hint.setAttribute( 'aria-hidden', 'true' );
        hint.innerHTML = this.isMobileDevice()
            ? '<span class="gracia-hint-icon gracia-hint-tap"></span>'
            : '<span class="gracia-hint-icon gracia-hint-click"></span>';

        slideElement.appendChild( hint );
        this.activeCursorHint = hint;

        // Fade in
        requestAnimationFrame( () => hint.classList.add( 'visible' ) );

        // Auto-remove after 3s
        this.pendingCursorHintTimer = setTimeout( () => {
            this.hideCurrentCursorHint();
        }, 3000 );

        this.cursorHintShown.add( slideId );
    }

    hideCurrentCursorHint() {
        if ( this.pendingCursorHintTimer ) {
            clearTimeout( this.pendingCursorHintTimer );
            this.pendingCursorHintTimer = null;
        }
        if ( this.activeCursorHint ) {
            this.activeCursorHint.remove();
            this.activeCursorHint = null;
        }
    }

    // =========================================================================
    // Post content hint
    // =========================================================================

    schedulePostContentHint( slideElement ) {
        return; // post content hint disabled
    }

    showPostContentHint( slideElement ) {
        const slideId = slideElement.id;
        if ( this.contentHintShown.has( slideId ) ) return;

        const hint = document.createElement( 'div' );
        hint.className = 'gracia-content-hint';
        hint.setAttribute( 'aria-hidden', 'true' );
        hint.textContent = this.lang === 'es'
            ? 'Desliza para leer más'
            : 'Scroll to read more';

        const content = slideElement.querySelector( '.gracia-card-content' );
        if ( content ) {
            content.appendChild( hint );
            this.activeTextHints.add( hint );
            requestAnimationFrame( () => hint.classList.add( 'visible' ) );
            this.contentHintShown.add( slideId );

            setTimeout( () => {
                hint.classList.remove( 'visible' );
                setTimeout( () => {
                    hint.remove();
                    this.activeTextHints.delete( hint );
                }, 500 );
            }, 2500 );
        }
    }

    hideAllActiveTextHints() {
        this.activeTextHints.forEach( hint => {
            hint.remove();
        } );
        this.activeTextHints.clear();
    }

    cancelPendingHints() {
        if ( this.pendingCursorHintTimer ) {
            clearTimeout( this.pendingCursorHintTimer );
            this.pendingCursorHintTimer = null;
        }
        if ( this.pendingContentHintTimer ) {
            clearTimeout( this.pendingContentHintTimer );
            this.pendingContentHintTimer = null;
        }
    }

    // =========================================================================
    // Scroll hints (IntersectionObserver)
    // =========================================================================

    initScrollHints() {
        if ( ! window.IntersectionObserver ) return;

        // Detect user scrolling to suppress hints
        this.slider.addEventListener( 'scroll', () => {
            this.isUserScrolling = true;
            clearTimeout( this.scrollTimer );
            this.scrollTimer = setTimeout( () => {
                this.isUserScrolling = false;
            }, 800 );
        }, { passive: true } );

        const observer = new IntersectionObserver( ( entries ) => {
            entries.forEach( entry => {
                if ( entry.isIntersecting && ! entry.target.classList.contains( 'opened' ) ) {
                    setTimeout( () => {
                        if ( ! this.isUserScrolling && ! entry.target.classList.contains( 'opened' ) ) {
                            this.showCursorHint( entry.target );
                        }
                    }, 1200 );
                } else {
                    this.hideCurrentCursorHint();
                }
            } );
        }, { threshold: 0.8 } );

        this.slides.forEach( slide => observer.observe( slide ) );
    }

    // =========================================================================
    // Keyboard navigation
    // =========================================================================

    initArrowKeyNavigation() {
        document.addEventListener( 'keydown', ( e ) => {
            if ( this.cardOpened ) return;

            const info = this.getVisibleSlideInfo();
            if ( info.index === -1 ) return;

            if ( e.key === 'ArrowDown' && info.index < this.slides.length - 1 ) {
                e.preventDefault();
                const next = this.slides[ info.index + 1 ];
                this.gotoSlide( { divId: next.id, openTheCard: false } );
            }

            if ( e.key === 'ArrowUp' && info.index > 0 ) {
                e.preventDefault();
                const prev = this.slides[ info.index - 1 ];
                this.gotoSlide( { divId: prev.id, openTheCard: false } );
            }
        } );
    }

    initEscapeKey() {
        document.addEventListener( 'keydown', ( e ) => {
            if ( e.key === 'Escape' ) {
                if ( this.cardOpened ) {
                    this.closeCards();
                } else if ( this.menuOpened ) {
                    this.deactivateMenu();
                }
                return;
            }

            if ( e.key === 'Enter' || e.key === ' ' ) {
                e.preventDefault();
                if ( this.cardOpened ) {
                    this.closeCards();
                } else if ( ! this.menuOpened ) {
                    const info = this.getVisibleSlideInfo();
                    if ( info.id ) {
                        this.openCard( { divId: info.id } );
                    }
                }
            }
        } );
    }

    // =========================================================================
    // Hash / deep link navigation
    // =========================================================================

    initHashChangeListener() {
        window.addEventListener( 'hashchange', () => {
            const hash = window.location.hash.replace( '#', '' ).trim();
            if ( hash ) {
                this.gotoSlide( { divId: hash, openTheCard: true } );
            }
        } );
    }

    checkDirectUrlVisit() {
        const hash = window.location.hash.replace( '#', '' ).trim();
        return hash.length > 0 && !! document.getElementById( hash );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    getVisibleSlideInfo() {
        let index = -1;
        let id    = null;

        this.slides.forEach( ( slide, i ) => {
            const rect = slide.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            if ( center >= 0 && center <= window.innerHeight ) {
                index = i;
                id    = slide.id;
            }
        } );

        return { index, id };
    }

    detectLanguage() {
        const lang = document.documentElement.lang || '';
        if ( lang.startsWith( 'es' ) ) return 'es';
        if ( window.location.pathname.includes( '/es/' ) ) return 'es';
        return 'en';
    }

    // =========================================================================
    // Mobile label overrides
    // =========================================================================

    /**
     * On narrow screens some slide titles are too long and overlap the logo.
     * This method replaces the visible h2 text for specific slides on mobile
     * while leaving data-title (used by the burger menu) unchanged.
     */
    applyMobileLabelOverrides() {
        if ( window.innerWidth > 600 ) return;

        // Keys are slide IDs (post slugs); values are the shorter mobile label.
        // The burger menu reads data-title, NOT the h2, so it is unaffected.
        const overrides = {
            'organizadorxs': 'ORGANIZADXR',
        };

        this.slides.forEach( slide => {
            const short = overrides[ slide.id ];
            if ( ! short ) return;

            const h2 = slide.querySelector( '.gracia-slide-label h2' );
            if ( h2 ) {
                h2.textContent = short;
            }
        } );
    }

    isSafari() {
        const ua = navigator.userAgent.toLowerCase();
        const isOtherIos = /crios|fxios|edgios|opios/.test( ua );
        return ! isOtherIos
            && ua.includes( 'safari' )
            && ! ua.includes( 'chrome' )
            && ! ua.includes( 'chromium' );
    }

    isMobileDevice() {
        return /iphone|ipad|ipod|android/i.test( navigator.userAgent )
            || window.innerWidth <= 768;
    }

    isMobilePhone() {
        return /iphone|ipod|android/i.test( navigator.userAgent )
            && ! /ipad/i.test( navigator.userAgent );
    }

    // =========================================================================
    // Safari warning
    // =========================================================================

    showSafariWarningIfNeeded() {
        return; // Safari warning disabled

        if ( ! this.isSafari() ) return;

        const warningEl = document.getElementById( 'gracia-safari-warning' );
        if ( ! warningEl ) return;

        warningEl.textContent = this.lang === 'es'
            ? 'Estas usando Safari. Para una mejor experiencia, utiliza otro navegador.'
            : 'You are using Safari. For best experience, please use another browser.';

        warningEl.style.display = 'block';
        setTimeout( () => {
            warningEl.style.opacity = '1';
        }, 50 );
    }

    // =========================================================================
    // Mobile landscape warning
    // =========================================================================

    initPinchZoomPrevention() {
        // Block pinch-to-zoom on both touchstart and touchmove.
        // { passive: false } is required — modern browsers default touch
        // listeners to passive, which silently ignores preventDefault().
        document.addEventListener( 'touchstart', this._preventPinchZoom, { passive: false } );
        document.addEventListener( 'touchmove',  this._preventPinchZoom, { passive: false } );
    }

    initMobileLandscapeWarning() {
        if ( ! this.isMobilePhone() ) return;

        this.landscapeOverlay = this.createLandscapeOverlay();
        document.body.appendChild( this.landscapeOverlay );

        this.checkLandscapeOrientation();

        window.addEventListener( 'orientationchange', () => {
            setTimeout( () => this.checkLandscapeOrientation(), 200 );
        } );

        window.addEventListener( 'resize', () => {
            this.checkLandscapeOrientation();
        } );
    }

    createLandscapeOverlay() {
        const overlay = document.createElement( 'div' );
        overlay.id        = 'gracia-landscape-warning';
        overlay.className = 'gracia-landscape-warning';
        overlay.setAttribute( 'aria-live', 'polite' );
        overlay.textContent = this.lang === 'es'
            ? 'Por favor gira tu dispositivo a modo vertical.'
            : 'Please rotate your device to portrait mode.';
        return overlay;
    }

    checkLandscapeOrientation() {
        const isLandscape = window.innerWidth > window.innerHeight;
        if ( this.landscapeOverlay ) {
            this.landscapeOverlay.classList.toggle( 'visible', isLandscape );
        }
    }
}

// Instantiate when DOM is ready
if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', () => {
        window.graciaNav = new Navigation();
    } );
} else {
    window.graciaNav = new Navigation();
}
