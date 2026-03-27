/**
 * PostHoverBox — Smart hover/tap system for keyword tags.
 *
 * Reads content from .hover-box[data-hover-id] elements inside the
 * <aside class="hover-box-layer"> and displays it in a single floating
 * panel positioned near the trigger span.hover-keyword[data-hover].
 *
 * Desktop: mouseenter/mouseleave with a short grace period.
 * Mobile:  click toggle; tap outside to dismiss.
 */

'use strict';

class PostHoverBox {

    constructor() {
        this.panel         = null;
        this.activeTrigger = null;
        this.activeSlug    = null;
        this.hideTimer     = null;
        this.isTouch       = this._detectTouch();

        this.GAP = 15;

        // Scroll-lock state
        this._scrollLocked = false;

        // Bound handlers — stored on instance so the same reference is used
        // for both addEventListener and removeEventListener.

        // Blocks mouse-wheel / trackpad scroll on desktop.
        // Panel events never reach this handler — the panel stops propagation
        // at its own listeners (see _buildPanel).
        this._boundBlockWheel = ( e ) => {
            e.preventDefault();
        };

        // Blocks native touch scroll on mobile / iOS Safari.
        // Same — panel events are stopped before they reach document.
        this._boundBlockTouchMove = ( e ) => {
            e.preventDefault();
        };

        // Blocks keyboard-driven scroll (arrow keys, Page Up/Down, Space, etc.)
        this._boundBlockKeyScroll = ( e ) => {
            const SCROLL_KEYS = [ 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ' ];
            if ( ! SCROLL_KEYS.includes( e.key ) ) return;
            if ( e.target.matches( 'input, textarea, select' ) ) return;
            e.preventDefault();
        };

        this.init();
    }

    // =========================================================================
    // Initialisation
    // =========================================================================

    init() {
        const triggers = document.querySelectorAll( 'span.hover-keyword[data-hover]' );
        if ( triggers.length === 0 ) return;

        this._buildPanel();
        this._bindTriggers( triggers );
        this._bindGlobalDismiss();
        this._bindResize();
    }

    // =========================================================================
    // Panel DOM
    // =========================================================================

    _buildPanel() {
        this.panel = document.createElement( 'div' );
        this.panel.id = 'gracia-hover-panel';
        this.panel.setAttribute( 'aria-hidden', 'true' );
        document.body.appendChild( this.panel );

        // Panel-level scroll handling.
        //
        // Two cases:
        //   a) Panel has overflow (content taller than max-height):
        //      stopPropagation only — the document-level preventDefault handler
        //      never fires, so the browser handles the gesture natively and
        //      scrolls the panel via overflow-y: auto.
        //   b) Panel has no overflow (content fits):
        //      preventDefault — there is nothing to scroll inside the panel,
        //      so without preventDefault the browser falls through to the page
        //      and scrolls it. We block that entirely.
        //
        // { passive: false } is required on touchmove so preventDefault() is
        // allowed when the panel has no overflow. overscroll-behavior: contain
        // (set in CSS) prevents scroll-chaining when the user reaches the
        // panel's scroll boundary.
        const panelScrollHandler = ( e ) => {
            if ( this.panel.scrollHeight > this.panel.clientHeight ) {
                e.stopPropagation();
            } else {
                e.preventDefault();
            }
        };
        this.panel.addEventListener( 'touchmove', panelScrollHandler, { passive: false } );
        this.panel.addEventListener( 'wheel',     panelScrollHandler );
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    _bindTriggers( triggers ) {
        // Bind BOTH pointer models on every trigger. On hybrid devices
        // (touchscreen laptops, Chrome DevTools mobile simulation) the
        // browser can fire either mouse or touch events depending on the
        // current input.  Binding both is safe: a tap fires click but not
        // mouseenter, and a real hover fires mouseenter but not click.
        triggers.forEach( trigger => {
            trigger.addEventListener( 'mouseenter', () => {
                if ( this.isTouch ) return;
                this._cancelHide();
                this._show( trigger );
            } );
            trigger.addEventListener( 'mouseleave', () => {
                if ( this.isTouch ) return;
                this._scheduleHide();
            } );
            trigger.addEventListener( 'click', ( e ) => {
                if ( ! this.isTouch ) return;
                e.preventDefault();
                e.stopPropagation();
                this._onTapTrigger( trigger );
            } );
        } );

        this.panel.addEventListener( 'mouseenter', () => {
            if ( this.isTouch ) return;
            this._cancelHide();
        } );
        this.panel.addEventListener( 'mouseleave', () => {
            if ( this.isTouch ) return;
            this._scheduleHide();
        } );
    }

    _bindGlobalDismiss() {
        document.addEventListener( 'click', ( e ) => {
            if ( ! this.activeTrigger ) return;
            if ( this.panel.contains( e.target ) ) return;
            if ( e.target.closest( 'span.hover-keyword' ) ) return;
            this._hide();
        } );
    }

    _bindResize() {
        let resizeTimer = null;
        window.addEventListener( 'resize', () => {
            clearTimeout( resizeTimer );
            resizeTimer = setTimeout( () => {
                if ( this.activeTrigger ) {
                    this._position( this.activeTrigger );
                }
            }, 150 );
        } );
    }

    // =========================================================================
    // Show / hide
    // =========================================================================

    _onTapTrigger( trigger ) {
        const slug = trigger.dataset.hover;

        if ( this.activeTrigger === trigger ) {
            this._hide();
            return;
        }

        this._show( trigger );
    }

    _show( trigger ) {
        const slug = trigger.dataset.hover;
        if ( ! slug ) return;

        const source = document.querySelector( `.hover-box[data-hover-id="${ slug }"]` );
        if ( ! source ) return;

        if ( this.activeSlug !== slug ) {
            this.panel.innerHTML = source.innerHTML;
            this._loadLazyMedia();
            this.activeSlug = slug;
        }

        this.activeTrigger = trigger;

        this.panel.classList.remove( 'is-visible' );
        this.panel.style.visibility = 'hidden';
        this.panel.style.display    = 'block';
        this.panel.style.opacity    = '0';

        // Force layout so getBoundingClientRect is accurate.
        this.panel.offsetHeight; // eslint-disable-line no-unused-expressions

        const pending = Array.from( this.panel.querySelectorAll( 'img[src]' ) )
            .filter( img => ! img.complete );

        if ( pending.length === 0 ) {
            // All content ready — use full smart positioning.
            this._position( trigger );
        } else {
            // Images still loading: show below the trigger so the panel can
            // only grow downward (away from the keyword) as images load.
            // The panel is revealed immediately so the user gets visual
            // feedback right away and the scroll lock feels responsive.
            this._positionBelow( trigger );

            // After each image loads, reposition with the correct final height.
            pending.forEach( img => {
                img.addEventListener( 'load', () => {
                    if ( this.activeTrigger !== trigger ) return;
                    this.panel.offsetHeight; // eslint-disable-line no-unused-expressions
                    this._position( trigger );
                }, { once: true } );
            } );
        }

        this.panel.style.visibility = '';
        this.panel.style.opacity    = '';
        this.panel.classList.add( 'is-visible' );
        this.panel.setAttribute( 'aria-hidden', 'false' );

        this._lockScroll();
    }

    _hide() {
        this._cancelHide();

        this.panel.classList.remove( 'is-visible' );
        this.panel.setAttribute( 'aria-hidden', 'true' );
        this.activeTrigger = null;

        this._unlockScroll();
    }

    _scheduleHide() {
        this._cancelHide();
        this.hideTimer = setTimeout( () => this._hide(), 120 );
    }

    _cancelHide() {
        if ( this.hideTimer ) {
            clearTimeout( this.hideTimer );
            this.hideTimer = null;
        }
    }

    // =========================================================================
    // Positioning (collision detection)
    // =========================================================================

    _position( trigger ) {
        const triggerRect = trigger.getBoundingClientRect();
        const panelRect   = this.panel.getBoundingClientRect();
        const vw  = window.innerWidth;
        const vh  = window.innerHeight;
        const gap = this.GAP;

        const panelW = panelRect.width;
        const panelH = panelRect.height;

        // Reserved zones: header at top (burger + logo), safe margin at bottom.
        const TOP_SAFE    = 100;
        const BOTTOM_SAFE = 15;

        // --- Horizontal: center on trigger, clamp to viewport ---
        let left = triggerRect.left + ( triggerRect.width / 2 ) - ( panelW / 2 );
        left = Math.max( gap, Math.min( left, vw - panelW - gap ) );

        // --- Vertical: prefer above trigger, flip below if not enough room ---
        // Both spaceAbove and spaceBelow exclude their respective safe zones.
        const spaceAbove = triggerRect.top - TOP_SAFE;
        const spaceBelow = vh - triggerRect.bottom - BOTTOM_SAFE;
        let top;

        if ( spaceAbove >= panelH + gap ) {
            top = triggerRect.top - panelH - gap;
        } else if ( spaceBelow >= panelH + gap ) {
            top = triggerRect.bottom + gap;
        } else {
            // Neither side fits cleanly — use whichever has more room
            if ( spaceAbove >= spaceBelow ) {
                top = triggerRect.top - panelH - gap;
            } else {
                top = triggerRect.bottom + gap;
            }
        }

        // Hard clamps: never overlap header or bottom safe zone
        top = Math.max( TOP_SAFE + gap, top );
        top = Math.min( top, vh - panelH - BOTTOM_SAFE );

        this.panel.style.left = `${ Math.round( left ) }px`;
        this.panel.style.top  = `${ Math.round( top ) }px`;
    }

    // Always places the panel below the trigger. Used when images are still
    // loading so the panel can only grow downward (never over the keyword).
    _positionBelow( trigger ) {
        const triggerRect = trigger.getBoundingClientRect();
        const panelRect   = this.panel.getBoundingClientRect();
        const vw  = window.innerWidth;
        const vh  = window.innerHeight;
        const gap = this.GAP;

        const TOP_SAFE    = 80;
        const BOTTOM_SAFE = 15;

        let left = triggerRect.left + ( triggerRect.width / 2 ) - ( panelRect.width / 2 );
        left = Math.max( gap, Math.min( left, vw - panelRect.width - gap ) );

        let top = triggerRect.bottom + gap;
        top = Math.max( TOP_SAFE + gap, top );
        top = Math.min( top, vh - panelRect.height - BOTTOM_SAFE );

        this.panel.style.left = `${ Math.round( left ) }px`;
        this.panel.style.top  = `${ Math.round( top ) }px`;
    }

    // =========================================================================
    // Scroll lock (desktop + mobile)
    // =========================================================================

    _lockScroll() {
        if ( this._scrollLocked ) return;

        // Block all user-initiated scroll purely at the event level.
        // No CSS changes to overflow or padding — any mutation of html/body
        // overflow or the scrollbar presence causes the fixed background image
        // to jump due to a viewport reflow. Event prevention is sufficient:
        //   wheel     — mouse wheel / trackpad on desktop
        //   touchmove — native touch scroll on mobile / iOS Safari
        //   keydown   — arrow keys, Page Up/Down, Space, Home, End
        document.addEventListener( 'wheel',     this._boundBlockWheel,     { passive: false } );
        document.addEventListener( 'touchmove', this._boundBlockTouchMove, { passive: false } );
        document.addEventListener( 'keydown',   this._boundBlockKeyScroll, false );

        this._scrollLocked = true;
    }

    _unlockScroll() {
        if ( ! this._scrollLocked ) return;

        document.removeEventListener( 'wheel',     this._boundBlockWheel );
        document.removeEventListener( 'touchmove', this._boundBlockTouchMove );
        document.removeEventListener( 'keydown',   this._boundBlockKeyScroll );

        this._scrollLocked = false;
    }

    // =========================================================================
    // Lazy media loading
    // =========================================================================

    _loadLazyMedia() {
        this.panel.querySelectorAll( 'img[data-src], video[data-src]' ).forEach( el => {
            el.src = el.dataset.src;
            el.removeAttribute( 'data-src' );
        } );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    _detectTouch() {
        // matchMedia 'pointer: coarse' is the most reliable signal for a
        // touch-primary device.  'ontouchstart' in window returns true on
        // many desktop browsers (Chrome, Edge) even without a touchscreen.
        return window.matchMedia( '(pointer: coarse)' ).matches;
    }
}

// Instantiate when DOM is ready
if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', () => {
        window.graciaHoverBox = new PostHoverBox();
    } );
} else {
    window.graciaHoverBox = new PostHoverBox();
}
