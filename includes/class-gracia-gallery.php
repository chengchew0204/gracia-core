<?php
/**
 * Gallery asset registration.
 *
 * Enqueues gallery.css and gallery.js on any page that contains
 * the [gracia_homepage] shortcode. The gallery post body is raw HTML
 * (no shortcode) — all video data lives in data-vimeo / data-src
 * attributes on div.gallery-slide elements.
 *
 * JS is responsible for reading those attributes and injecting video
 * elements only when the gallery card is opened.
 *
 * @package GraciaCore
 * @see 01-features/gallery (Obsidian spec)
 * @see 03-decisions/ADR-004-gallery-data-model
 */

defined( 'ABSPATH' ) || exit;

class Gracia_Gallery {

    public function register(): void {
        add_action( 'wp', [ $this, 'maybe_enqueue_gallery_assets' ] );
    }

    /**
     * Enqueue gallery CSS and JS on pages that render the homepage slider.
     *
     * The gallery post is one of the slides rendered by [gracia_homepage].
     * Gallery assets are only needed on those pages, not globally.
     * Detection mirrors the pattern used in Gracia_Homepage::maybe_add_homepage_body_class().
     */
    public function maybe_enqueue_gallery_assets(): void {
        global $post;

        if ( ! $post || ! has_shortcode( $post->post_content, 'gracia_homepage' ) ) {
            return;
        }

        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );
    }

    public function enqueue_assets(): void {
        wp_enqueue_style(
            'gracia-gallery',
            GRACIA_PLUGIN_URL . 'assets/css/gallery.css',
            [],
            GRACIA_VERSION
        );

        wp_enqueue_script(
            'gracia-gallery',
            GRACIA_PLUGIN_URL . 'assets/js/gallery.js',
            [],
            GRACIA_VERSION,
            true
        );

        wp_localize_script(
            'gracia-gallery',
            'graciaGalleryConfig',
            [
                'playIconUrl' => GRACIA_PLUGIN_URL . 'assets/img/play-2.png',
            ]
        );
    }
}
