<?php
/**
 * Main plugin class. Bootstraps all feature modules.
 *
 * @package GraciaCore
 */

defined( 'ABSPATH' ) || exit;

class Gracia_Core {

    private static ?Gracia_Core $instance = null;

    public static function instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {}

    public function init(): void {
        $this->load_textdomain();
        $this->register_modules();
        $this->enqueue_assets();
    }

    private function load_textdomain(): void {
        load_plugin_textdomain(
            'gracia-core',
            false,
            dirname( plugin_basename( GRACIA_PLUGIN_DIR . 'gracia-core.php' ) ) . '/languages'
        );
    }

    private function register_modules(): void {
        require_once GRACIA_PLUGIN_DIR . 'includes/class-gracia-homepage.php';
        ( new Gracia_Homepage() )->register();

        require_once GRACIA_PLUGIN_DIR . 'includes/class-gracia-gallery.php';
        ( new Gracia_Gallery() )->register();
    }

    private function enqueue_assets(): void {
        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_frontend_assets' ] );
    }

    public function enqueue_frontend_assets(): void {
        if ( is_singular() ) {
            wp_enqueue_style(
                'gracia-text-post',
                GRACIA_PLUGIN_URL . 'assets/css/text-based-post.css',
                [],
                GRACIA_VERSION
            );

            wp_enqueue_style(
                'gracia-hover-box',
                GRACIA_PLUGIN_URL . 'assets/css/post-hover-box.css',
                [ 'gracia-text-post' ],
                GRACIA_VERSION
            );

            wp_enqueue_script(
                'gracia-hover-box',
                GRACIA_PLUGIN_URL . 'assets/js/post-hover-box.js',
                [],
                GRACIA_VERSION,
                true
            );
        }
    }
}
