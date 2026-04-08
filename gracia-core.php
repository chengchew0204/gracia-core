<?php
/**
 * Plugin Name: Gracia Core
 * Plugin URI:  https://gracia.la
 * Description: Core functionality for gracia.la. Built from scratch for clean, performant code.
 * Version:     1.0.48
 * Author:      zackwoo
 * Author URI:  https://gracia.la
 * Text Domain: gracia-core
 * Domain Path: /languages
 * Requires at least: 6.4
 * Requires PHP: 8.0
 *
 * @package GraciaCore
 */

defined( 'ABSPATH' ) || exit;

define( 'GRACIA_VERSION',    '1.0.48' );
define( 'GRACIA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GRACIA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once GRACIA_PLUGIN_DIR . 'includes/class-gracia-core.php';

add_action( 'plugins_loaded', function () {
    Gracia_Core::instance()->init();
} );

add_action( 'wp_footer', 'gracia_render_social_icons' );

function gracia_render_social_icons(): void {
    $lang   = function_exists( 'pll_current_language' ) ? pll_current_language() : 'es';
    $is_en  = ( $lang === 'en' );

    // Show the flag of the OTHER language (the destination when clicked).
    // ES page → UK flag → goes to EN home
    // EN page → Mexican flag → goes to ES home
    $target_lang = $is_en ? 'es' : 'en';
    if ( function_exists( 'pll_home_url' ) ) {
        $lang_url = pll_home_url( $target_lang );
    } else {
        $lang_url = $is_en ? home_url( '/' ) : home_url( '/en/' );
    }
    $lang_label = $is_en ? 'Versión en español' : 'English version';
    // circle-flags provides pre-made circular flag SVGs — no cropping needed.
    $flag_src   = $is_en
        ? 'https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@latest/flags/mx.svg'
        : 'https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@latest/flags/gb.svg';
    ?>
    <div id="gracia-social-icons" aria-label="Social links">
        <div class="ct-social-box">

            <a href="https://m.me/lagraciamx"
               aria-label="Facebook Messenger"
               target="_blank"
               rel="noopener noreferrer nofollow">
                <span class="ct-icon-container">
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M10,0C4.5,0,0.1,4.1,0.1,9.2c0,2.7,1.2,5.2,3.4,7V20l3.7-1.9c0.9,0.3,1.8,0.3,2.7,0.3c5.5,0,9.9-4.1,9.9-9.2C19.9,4.1,15.5,0,10,0z M11,12.3L8.5,9.6l-4.6,2.6L9,6.8l2.5,2.5l4.5-2.5L11,12.3z"/>
                    </svg>
                </span>
            </a>

            <a href="https://www.instagram.com/lagraciamx"
               aria-label="Instagram"
               target="_blank"
               rel="noopener noreferrer nofollow">
                <span class="ct-icon-container">
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                        <circle cx="10" cy="10" r="3.3"/>
                        <path d="M14.2,0H5.8C2.6,0,0,2.6,0,5.8v8.3C0,17.4,2.6,20,5.8,20h8.3c3.2,0,5.8-2.6,5.8-5.8V5.8C20,2.6,17.4,0,14.2,0zM10,15c-2.8,0-5-2.2-5-5s2.2-5,5-5s5,2.2,5,5S12.8,15,10,15z M15.8,5C15.4,5,15,4.6,15,4.2s0.4-0.8,0.8-0.8s0.8,0.4,0.8,0.8S16.3,5,15.8,5z"/>
                    </svg>
                </span>
            </a>

            <a href="<?php echo esc_url( $lang_url ); ?>"
               aria-label="<?php echo esc_attr( $lang_label ); ?>"
               target="_self">
                <img class="gracia-flag-icon"
                     src="<?php echo esc_url( $flag_src ); ?>"
                     width="35" height="35"
                     alt=""
                     aria-hidden="true">
            </a>

        </div>
    </div>
    <?php
}
