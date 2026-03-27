<?php
/**
 * Plugin Name: Gracia Core
 * Plugin URI:  https://gracia.la
 * Description: Core functionality for gracia.la. Built from scratch for clean, performant code.
 * Version:     1.0.41
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

define( 'GRACIA_VERSION',    '1.0.41' );
define( 'GRACIA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GRACIA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once GRACIA_PLUGIN_DIR . 'includes/class-gracia-core.php';

add_action( 'plugins_loaded', function () {
    Gracia_Core::instance()->init();
} );
