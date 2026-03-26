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

        this.GAP = 8;

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

        // Make the panel measurable but invisible so _position can read
        // its actual height/width before we fade it in.
        this.panel.classList.remove( 'is-visible' );
        this.panel.style.visibility = 'hidden';
        this.panel.style.display    = 'block';
        this.panel.style.opacity    = '0';

        // Force a layout so the browser computes dimensions.
        this.panel.offsetHeight; // eslint-disable-line no-unused-expressions

        this._position( trigger );

        this.panel.style.visibility = '';
        this.panel.style.opacity    = '';
        this.panel.classList.add( 'is-visible' );
        this.panel.setAttribute( 'aria-hidden', 'false' );
    }

    _hide() {
        this._cancelHide();
        this.panel.classList.remove( 'is-visible' );
        this.panel.setAttribute( 'aria-hidden', 'true' );
        this.activeTrigger = null;
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
        const panelRect  = this.panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = this.GAP;

        const panelW = panelRect.width;
        const panelH = panelRect.height;

        // --- Horizontal: center on trigger, clamp to viewport ---
        let left = triggerRect.left + ( triggerRect.width / 2 ) - ( panelW / 2 );
        left = Math.max( gap, Math.min( left, vw - panelW - gap ) );

        // --- Vertical: prefer above, flip below if needed ---
        const spaceAbove = triggerRect.top;
        const spaceBelow = vh - triggerRect.bottom;
        let top;

        if ( spaceAbove >= panelH + gap ) {
            top = triggerRect.top - panelH - gap;
        } else if ( spaceBelow >= panelH + gap ) {
            top = triggerRect.bottom + gap;
        } else {
            // Neither fits cleanly -- use whichever side has more room
            if ( spaceAbove >= spaceBelow ) {
                top = Math.max( gap, triggerRect.top - panelH - gap );
            } else {
                top = triggerRect.bottom + gap;
                // If it overflows bottom, clamp
                if ( top + panelH > vh - gap ) {
                    top = vh - panelH - gap;
                }
            }
        }

        this.panel.style.left = `${ Math.round( left ) }px`;
        this.panel.style.top  = `${ Math.round( top ) }px`;
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
