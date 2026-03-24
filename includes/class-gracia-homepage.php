<?php
/**
 * Homepage slider shortcode and asset registration.
 *
 * Shortcode: [gracia_homepage category="homepage"]
 *
 * Each published post in the given category becomes a fullscreen slide.
 * Slide ID is derived from the post slug — no custom post meta required.
 *
 * @package GraciaCore
 */

defined( 'ABSPATH' ) || exit;

class Gracia_Homepage {

    public function register(): void {
        add_shortcode( 'gracia_homepage', [ $this, 'render_shortcode' ] );
        add_action( 'wp', [ $this, 'maybe_add_homepage_body_class' ] );
    }

    /**
     * If the current page contains [gracia_homepage], add a body class so CSS
     * can remove the Blocksy header, page title, and make containers fullscreen.
     * Must run on the `wp` hook so $post is available before body_class fires.
     */
    public function maybe_add_homepage_body_class(): void {
        global $post;
        if ( $post && has_shortcode( $post->post_content, 'gracia_homepage' ) ) {
            add_filter( 'body_class', [ $this, 'add_homepage_body_class' ] );
            // Preload fonts with high priority so the browser starts downloading
            // them immediately — before CSS is parsed — eliminating the flash of
            // the wrong (thin) fallback font on first load.
            add_action( 'wp_head', [ $this, 'preload_fonts' ], 1 );
        }
    }

    /**
     * @param string[] $classes
     * @return string[]
     */
    public function add_homepage_body_class( array $classes ): array {
        $classes[] = 'gracia-homepage-active';
        return $classes;
    }

    /**
     * Output <link rel="preload"> tags for ClearSans font files.
     *
     * Runs at wp_head priority 1 (very early) so the browser fetches font
     * files in parallel with stylesheet downloads — eliminating the flash of
     * the thinner fallback font that occurs when fonts load too late.
     *
     * Only the three weights visible above-the-fold are preloaded to avoid
     * unnecessary requests:
     *   Regular (400) — body text and card content
     *   Medium  (500) — slide title labels
     *   Bold    (700) — burger menu items
     */
    public function preload_fonts(): void {
        $fonts = [
            'ClearSans-Regular.woff2',
            'ClearSans-Medium.woff2',
            'ClearSans-Bold.woff2',
        ];

        foreach ( $fonts as $font_file ) {
            $url = esc_url( GRACIA_PLUGIN_URL . 'assets/fonts/' . $font_file );
            echo '<link rel="preload" href="' . $url . '" as="font" type="font/woff2" crossorigin="anonymous">' . "\n";
        }
    }

    /**
     * Render the homepage slider HTML.
     *
     * Polylang compatibility: when Polylang is active, get_posts() automatically
     * returns only posts in the current language — no extra language filtering needed.
     * Place the shortcode on both the EN and ES homepage pages; each will render
     * its own language's posts.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_shortcode( array $atts ): string {
        $atts = shortcode_atts(
            [ 'category' => 'homepage' ],
            $atts,
            'gracia_homepage'
        );

        $cat_slug = sanitize_text_field( $atts['category'] );

        $query_args = [
            'post_type'      => 'post',
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'orderby'        => 'date',
            'order'          => 'ASC',
        ];

        // Polylang: explicitly pass the current language so only posts in the
        // current language are returned. Empty string = no filter (fallback).
        if ( function_exists( 'pll_current_language' ) ) {
            $query_args['lang'] = pll_current_language();
        }

        // Resolve the category term ID in a Polylang-aware way.
        // Polylang translates categories, so we need the term ID for the current
        // language. pll_get_term() returns the translated term ID if it exists,
        // otherwise falls back to the original term.
        // Resolve which category term ID to use, accounting for Polylang translations.
        // Polylang may assign a different slug to translated categories (e.g. 'homepage-es'),
        // so we look up by the current language translation first, then fall back.
        $resolved_term_id = $this->resolve_category_id( $cat_slug );

        if ( $resolved_term_id ) {
            $query_args['cat'] = $resolved_term_id;
        } else {
            $query_args['category_name'] = $cat_slug;
        }

        $posts = get_posts( $query_args );

        if ( empty( $posts ) ) {
            return '';
        }

        $this->enqueue_assets();

        ob_start();
        ?>
        <div class="gracia-slides" id="gracia-slides">

            <?php $this->render_loading_spinner(); ?>
            <?php $this->render_site_logo(); ?>

            <?php
            $total = count( $posts );
            foreach ( $posts as $index => $post ) :
                $slide_id      = sanitize_title( $post->post_name );
                $title         = esc_attr( $post->post_title );
                $post_id       = absint( $post->ID );
                $is_last       = ( $index === $total - 1 );
                $images        = $this->get_slide_images( $post_id );
                $has_bg        = ! empty( $images['high_res'] );
                $next_slide_id = '';
                if ( ! $is_last ) {
                    $next_slide_id = sanitize_title( $posts[ $index + 1 ]->post_name );
                }
            ?>

            <div class="gracia-slide <?php echo $has_bg ? '' : 'no-thumbnail'; ?> closed"
                 id="<?php echo esc_attr( $slide_id ); ?>"
                 data-title="<?php echo $title; ?>"
                 data-post="<?php echo $post_id; ?>"
                 <?php if ( $has_bg ) : ?>
                 data-bg-low-res="<?php echo esc_url( $images['low_res'] ); ?>"
                 data-bg-high-res="<?php echo esc_url( $images['high_res'] ); ?>"
                 style="background-image: url('<?php echo esc_url( $images['low_res'] ); ?>')"
                 <?php endif; ?>>

                <?php if ( $has_bg ) : ?>
                <img src="<?php echo esc_url( $images['high_res'] ); ?>"
                     style="display:none" loading="lazy" decoding="async" alt="">
                <?php endif; ?>

                <?php if ( $post->post_excerpt ) : ?>
                <div class="gracia-slide-excerpt"><?php echo wp_kses_post( $post->post_excerpt ); ?></div>
                <?php endif; ?>

                <div class="gracia-slide-bg"></div>

                <?php if ( ! $is_last ) : ?>
                <div class="gracia-caret-wrap">
                    <a class="gracia-caret" data-target-slide="<?php echo esc_attr( $next_slide_id ); ?>">
                        <?php echo $this->caret_svg(); ?>
                    </a>
                </div>
                <?php endif; ?>

                <div class="gracia-slide-label">
                    <h2><?php echo esc_html( $post->post_title ); ?></h2>
                </div>

                <div class="gracia-slide-scroll">
                    <div class="gracia-card">
                        <div class="gracia-card-content">
                            <div class="gracia-tap-top"></div>
                            <div class="gracia-tap-left"></div>
                            <div class="gracia-tap-right"></div>
                            <?php echo do_shortcode( apply_filters( 'the_content', $post->post_content ) ); ?>
                            <div class="gracia-tap-bottom"></div>
                        </div>
                    </div>
                </div>

            </div>

            <?php endforeach; ?>

        </div><?php // .gracia-slides ?>
        <?php
        wp_reset_postdata();
        return ob_get_clean();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Resolve the correct category term ID for the current language.
     *
     * Polylang filters get_term_by() by the current language, so searching for
     * an EN slug ('homepage') while in ES context returns nothing. We bypass
     * this by using WP_Term_Query with lang='' (all languages), find the base
     * term, then ask Polylang for its translation in the current language.
     *
     * @param string $slug Category slug as passed to the shortcode.
     * @return int|null Resolved term ID or null if not found.
     */
    private function resolve_category_id( string $slug ): ?int {
        $current_lang = function_exists( 'pll_current_language' ) ? pll_current_language() : '';

        // Query terms across ALL languages (lang='' bypasses Polylang's filter).
        $term_query = new WP_Term_Query( [
            'taxonomy'   => 'category',
            'slug'       => $slug,
            'hide_empty' => false,
            'number'     => 5,
            'lang'       => '', // Polylang: empty = all languages
        ] );

        $terms = $term_query->get_terms();

        if ( empty( $terms ) || is_wp_error( $terms ) ) {
            return null;
        }

        // If Polylang is active, find the term whose language matches current lang.
        if ( $current_lang && function_exists( 'pll_get_term_language' ) ) {
            foreach ( $terms as $term ) {
                if ( pll_get_term_language( $term->term_id ) === $current_lang ) {
                    return (int) $term->term_id;
                }
            }

            // No direct match — try pll_get_term() on the first result to get
            // the translated version.
            if ( function_exists( 'pll_get_term' ) ) {
                $translated_id = pll_get_term( $terms[0]->term_id, $current_lang );
                if ( $translated_id ) {
                    return (int) $translated_id;
                }
            }
        }

        // Fallback: return first found term (no Polylang or no translation).
        return (int) $terms[0]->term_id;
    }

    /**
     * Return high-res and low-res featured image URLs for a post.
     * Low-res: looks for an attachment whose filename contains "{name}-low-res".
     * Falls back to high-res if no low-res version found.
     *
     * @param int $post_id
     * @return array{high_res: string, low_res: string}
     */
    private function get_slide_images( int $post_id ): array {
        $thumbnail_id = get_post_thumbnail_id( $post_id );

        if ( ! $thumbnail_id ) {
            return [ 'high_res' => '', 'low_res' => '' ];
        }

        $high_res = wp_get_attachment_image_url( $thumbnail_id, 'full' );
        $info     = pathinfo( $high_res );
        $low_res  = $high_res; // default fallback

        $low_res_results = get_posts( [
            'post_type'      => 'attachment',
            'posts_per_page' => 1,
            'post_status'    => 'inherit',
            'meta_query'     => [ [
                'key'     => '_wp_attached_file',
                'value'   => $info['filename'] . '-low-res',
                'compare' => 'LIKE',
            ] ],
        ] );

        if ( ! empty( $low_res_results ) ) {
            $low_res = wp_get_attachment_url( $low_res_results[0]->ID );
        }

        return [ 'high_res' => $high_res, 'low_res' => $low_res ];
    }

    /**
     * Output the loading spinner markup.
     */
    private function render_loading_spinner(): void {
        ?>
        <div id="gracia-loading-spinner" aria-hidden="true">
            <div class="gracia-spinner-wrapper">
                <div class="gracia-spinner"></div>
                <div id="gracia-safari-warning" style="display:none"></div>
            </div>
        </div>
        <?php
    }

    /**
     * Return the caret SVG string — matches camp.mx's caret3.svg shape.
     * Wide flat chevron pointing down, white fill.
     */
    private function caret_svg(): string {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41.5 17" aria-hidden="true">'
             . '<path fill="#ffffff" d="M20.4,17c-0.3,0-0.6-0.1-0.8-0.3L0.5,2.4C-0.1,2-0.2,1.1,0.3,0.5'
             . 'c0.4-0.6,1.3-0.7,1.9-0.3L20.5,14L39.3,0.3c0.6-0.4,1.4-0.3,1.9,0.3'
             . 'c0.4,0.6,0.3,1.4-0.3,1.9L21.2,16.8C21,16.9,20.7,17,20.4,17z"/>'
             . '</svg>';
    }

    /**
     * Render the site logo as a fixed top-right image inside the slider.
     *
     * Finds the most recent Media Library attachment whose filename contains "logo".
     */
    private function render_site_logo(): void {
        $site_url = esc_url( home_url( '/' ) );
        $logo_alt = esc_attr( get_bloginfo( 'name' ) );

        $results = get_posts( [
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'posts_per_page' => 1,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'meta_query'     => [ [
                'key'     => '_wp_attached_file',
                'value'   => 'logo',
                'compare' => 'LIKE',
            ] ],
        ] );

        if ( empty( $results ) ) {
            return;
        }

        $logo_src = wp_get_attachment_url( $results[0]->ID );
        ?>
        <a href="<?php echo $site_url; ?>" class="gracia-site-logo" aria-label="<?php echo $logo_alt; ?>">
            <img src="<?php echo esc_url( $logo_src ); ?>" alt="<?php echo $logo_alt; ?>">
        </a>
        <?php
    }

    /**
     * Enqueue frontend assets (called once per page, WP deduplicates).
     */
    private function enqueue_assets(): void {
        wp_enqueue_style(
            'gracia-homepage',
            GRACIA_PLUGIN_URL . 'assets/css/homepage.css',
            [],
            GRACIA_VERSION
        );

        // Inject asset URLs using absolute plugin URLs — relative paths in CSS
        // can fail due to WordPress's stylesheet URL resolution.
        $burger_url = esc_url( GRACIA_PLUGIN_URL . 'assets/img/hamburger_withshadow.png' );
        $caret_url  = esc_url( GRACIA_PLUGIN_URL . 'assets/img/caret28.svg' );
        wp_add_inline_style(
            'gracia-homepage',
            "button.ct-header-trigger.ct-toggle { background-image: url('{$burger_url}') !important; }
.gracia-slide-label h2::after { background-image: url('{$caret_url}') !important; }"
        );

        wp_enqueue_script(
            'gracia-navigation',
            GRACIA_PLUGIN_URL . 'assets/js/navigation.js',
            [],
            GRACIA_VERSION,
            true  // load in footer
        );
    }
}
