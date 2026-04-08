/**
 * Map auto-pan — smooth horizontal scroll reveal when the map slide opens.
 *
 * Behaviour: on open, the map scrolls from the left edge to the right edge,
 * then back to a resting position slightly left of centre.  This mirrors the
 * camp.mx "reveal" effect but uses requestAnimationFrame with easing for a
 * much smoother result.
 *
 * Detection: a MutationObserver watches the .gracia-slide#mapa / #map element
 * for the 'opened' class — no polling, no modification of navigation.js.
 *
 * @package GraciaCore
 */

( function () {
    'use strict';

    window.mapscroll = 1;

    const MAP_IDS        = [ 'mapa', 'map' ];
    const CENTER_OFFSET  = 80;
    const PAN_RIGHT_MS   = 1400;
    const PAN_LEFT_MS    = 1000;
    const INITIAL_DELAY  = 300;

    function easeInOutCubic( t ) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow( -2 * t + 2, 3 ) / 2;
    }

    function animateScroll( el, from, to, duration ) {
        return new Promise( ( resolve ) => {
            const distance = to - from;
            if ( Math.abs( distance ) < 1 ) {
                el.scrollLeft = to;
                resolve();
                return;
            }

            let start = null;
            let rafId = null;

            function step( ts ) {
                if ( ! start ) start = ts;
                const elapsed  = ts - start;
                const progress = Math.min( elapsed / duration, 1 );
                el.scrollLeft  = from + distance * easeInOutCubic( progress );

                if ( progress < 1 ) {
                    rafId = requestAnimationFrame( step );
                } else {
                    resolve();
                }
            }

            rafId = requestAnimationFrame( step );

            el._graciaMapPanCancel = () => {
                if ( rafId !== null ) cancelAnimationFrame( rafId );
                resolve();
            };
        } );
    }

    function runPanSequence( container ) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        if ( maxScroll <= 0 ) {
            window.mapscroll = 0;
            return;
        }

        const center = maxScroll / 2;
        const target = Math.max( 0, center - CENTER_OFFSET );

        container.scrollLeft = 0;
        container._graciaMapPanning = true;
        window.mapscroll = 1;

        setTimeout( async () => {
            const slide = container.closest( '.gracia-slide' );
            if ( ! slide || ! slide.classList.contains( 'opened' ) ) {
                container._graciaMapPanning = false;
                window.mapscroll = 0;
                return;
            }

            await animateScroll( container, 0, maxScroll, PAN_RIGHT_MS );

            if ( ! slide.classList.contains( 'opened' ) ) {
                container._graciaMapPanning = false;
                window.mapscroll = 0;
                return;
            }

            await animateScroll( container, maxScroll, target, PAN_LEFT_MS );
            container._graciaMapPanning = false;
            window.mapscroll = 0;
        }, INITIAL_DELAY );
    }

    function cancelPan( container ) {
        if ( typeof container._graciaMapPanCancel === 'function' ) {
            container._graciaMapPanCancel();
            container._graciaMapPanCancel = null;
        }
        container._graciaMapPanning = false;
        window.mapscroll = 1;
    }

    function getMapContainer( slide ) {
        return slide.querySelector( '.interactive-map' );
    }

    function observeSlide( slide ) {
        const observer = new MutationObserver( ( mutations ) => {
            for ( const m of mutations ) {
                if ( m.attributeName !== 'class' ) continue;

                const isOpen = slide.classList.contains( 'opened' );
                const container = getMapContainer( slide );
                if ( ! container ) continue;

                if ( isOpen && ! container._graciaMapPanning ) {
                    runPanSequence( container );
                } else if ( ! isOpen ) {
                    cancelPan( container );
                }
            }
        } );

        observer.observe( slide, { attributes: true, attributeFilter: [ 'class' ] } );
    }

    function init() {
        for ( const id of MAP_IDS ) {
            const slide = document.getElementById( id );
            if ( slide && slide.classList.contains( 'gracia-slide' ) ) {
                observeSlide( slide );
            }
        }
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }

} )();
