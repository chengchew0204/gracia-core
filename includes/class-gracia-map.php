<?php
/**
 * Interactive map — single source of truth via camp.mx REST API.
 *
 * Fetches the map post content from camp.mx at runtime, applies JS
 * compatibility patches for gracia.la's theme structure, and caches
 * the result in a WordPress Transient.  A webhook endpoint allows
 * camp.mx to purge the cache on save.
 *
 * Shortcode: [gracia_map]
 * REST route: POST /gracia/v1/map-cache-purge
 *
 * @package GraciaCore
 * @see     obsidian/01-features/map.md
 * @see     obsidian/03-decisions/ADR-006-map-single-source-of-truth.md
 */

defined( 'ABSPATH' ) || exit;

class Gracia_Map {

    private const TRANSIENT_PREFIX = 'gracia_map_';
    private const CACHE_TTL        = HOUR_IN_SECONDS;
    private const FETCH_TIMEOUT    = 15;
    private const REST_NAMESPACE   = 'gracia/v1';
    private const SECRET_OPTION    = 'gracia_map_webhook_secret';

    private const CAMP_MX_API_BASE = 'https://camp.mx/wp-json/wp/v2/posts';

    private const SLUG_MAP = [
        'es' => 'mapa_p',
        'en' => 'map_p',
    ];

    public function register(): void {
        add_shortcode( 'gracia_map', [ $this, 'render_shortcode' ] );
        add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );
    }

    /* ------------------------------------------------------------------
     * Shortcode
     * ----------------------------------------------------------------*/

    public function render_shortcode( $atts = [] ): string {
        $this->enqueue_assets();

        $lang    = $this->get_current_language();
        $content = $this->get_cached_content( $lang );

        if ( false === $content ) {
            $content = $this->fetch_from_camp_mx( $lang );

            if ( is_wp_error( $content ) || empty( $content ) ) {
                $stale = get_transient( self::TRANSIENT_PREFIX . $lang );
                if ( false !== $stale ) {
                    return $stale;
                }
                return '<!-- gracia_map: content unavailable -->';
            }

            $content = $this->apply_js_patches( $content );
            $this->cache_content( $lang, $content );
        }

        return $content;
    }

    /* ------------------------------------------------------------------
     * Assets
     * ----------------------------------------------------------------*/

    private function enqueue_assets(): void {
        wp_enqueue_style(
            'gracia-map',
            GRACIA_PLUGIN_URL . 'assets/css/map.css',
            [ 'gracia-homepage' ],
            GRACIA_VERSION
        );
    }

    /* ------------------------------------------------------------------
     * Language detection
     * ----------------------------------------------------------------*/

    private function get_current_language(): string {
        if ( function_exists( 'pll_current_language' ) ) {
            $lang = pll_current_language( 'slug' );
            if ( $lang && isset( self::SLUG_MAP[ $lang ] ) ) {
                return $lang;
            }
        }
        return 'es';
    }

    /* ------------------------------------------------------------------
     * Transient cache
     * ----------------------------------------------------------------*/

    private function get_cached_content( string $lang ) {
        return get_transient( self::TRANSIENT_PREFIX . $lang );
    }

    private function cache_content( string $lang, string $content ): void {
        set_transient( self::TRANSIENT_PREFIX . $lang, $content, self::CACHE_TTL );
    }

    /* ------------------------------------------------------------------
     * Remote fetch
     * ----------------------------------------------------------------*/

    private function fetch_from_camp_mx( string $lang ) {
        $slug = self::SLUG_MAP[ $lang ] ?? 'mapa';
        $url  = add_query_arg(
            [
                'slug'    => $slug,
                '_fields' => 'content',
            ],
            self::CAMP_MX_API_BASE
        );

        $response = wp_remote_get( $url, [
            'timeout' => self::FETCH_TIMEOUT,
        ] );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        if ( 200 !== $code ) {
            return new \WP_Error(
                'gracia_map_http_error',
                sprintf( 'camp.mx returned HTTP %d', $code )
            );
        }

        $body  = wp_remote_retrieve_body( $response );
        $posts = json_decode( $body, true );

        if ( ! is_array( $posts ) || empty( $posts[0]['content']['rendered'] ) ) {
            return new \WP_Error(
                'gracia_map_empty',
                'camp.mx returned no content for slug: ' . $slug
            );
        }

        // WordPress REST API HTML-encodes certain characters in content.rendered
        // (e.g. && becomes &#038;&#038;).  This breaks inline <script> blocks.
        return wp_specialchars_decode( $posts[0]['content']['rendered'], ENT_QUOTES );
    }

    /* ------------------------------------------------------------------
     * JS compatibility patches
     *
     * The map HTML from camp.mx references theme-specific DOM selectors
     * that do not exist on gracia.la.  These str_replace calls adapt
     * the five known references.
     *
     * If camp.mx changes the patched strings, the patches will silently
     * stop matching — this is documented in ADR-006 as a known trade-off.
     * ----------------------------------------------------------------*/

    private function apply_js_patches( string $html ): string {
        $search  = [];
        $replace = [];

        // 1. Slide wrapper class: slide_10 → gracia-slide
        $search[]  = "classList.contains('slide_10')";
        $replace[] = "classList.contains('gracia-slide')";

        // 2. Body class for open card state
        $search[]  = "classList.contains('bodycardopened')";
        $replace[] = "classList.contains('gracia-homepage-active')";

        // 3. Card header selector for closeMap (EN)
        $search[]  = 'querySelector("#map .card-header")';
        $replace[] = 'querySelector("#map .gracia-tap-top")';

        // 4. Card header selector for closeMap (ES)
        $search[]  = 'querySelector("#mapa .card-header")';
        $replace[] = 'querySelector("#mapa .gracia-tap-top")';

        // 5. Body class detection for map open state — EN
        $search[]  = "body.classList.contains('map')";
        $replace[] = "!!document.querySelector('.gracia-slide.opened#map')";

        // 6. Body class detection for map open state — ES
        $search[]  = "body.classList.contains('mapa')";
        $replace[] = "!!document.querySelector('.gracia-slide.opened#mapa')";

        $html = str_replace( $search, $replace, $html );

        // 7. data-src lazy loading: camp.mx relies on a lazy loader that copies data-src
        // to src when images scroll into view.  gracia.la has no such loader, so layer
        // <img> elements never receive a src attribute and naturalWidth stays 0 forever,
        // causing performTransition()'s onLoad listener to wait indefinitely.
        // Converting data-src to src here lets the browser start fetching the images
        // immediately; performTransition() will either find them already loaded
        // (complete=true) or wait for onLoad, which will now actually fire.
        return str_replace( ' data-src=', ' src=', $html );
    }

    /* ------------------------------------------------------------------
     * Cache purge webhook
     * ----------------------------------------------------------------*/

    public function register_rest_routes(): void {
        register_rest_route( self::REST_NAMESPACE, '/map-cache-purge', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'handle_cache_purge' ],
            'permission_callback' => '__return_true',
        ] );
    }

    public function handle_cache_purge( \WP_REST_Request $request ): \WP_REST_Response {
        $secret   = $request->get_param( 'secret' );
        $expected = get_option( self::SECRET_OPTION, '' );

        if ( empty( $expected ) || ! hash_equals( $expected, (string) $secret ) ) {
            return new \WP_REST_Response( [ 'error' => 'forbidden' ], 403 );
        }

        foreach ( array_keys( self::SLUG_MAP ) as $lang ) {
            delete_transient( self::TRANSIENT_PREFIX . $lang );
        }

        return new \WP_REST_Response( [ 'success' => true ], 200 );
    }
}
