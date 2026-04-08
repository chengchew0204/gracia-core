<?php
/**
 * Footer social icons bar.
 *
 * Outputs a fixed-position social-icon bar via wp_footer.
 * Visibility on the homepage is suppressed by CSS (body.gracia-homepage-active).
 *
 * @package GraciaCore
 */

defined( 'ABSPATH' ) || exit;

class Gracia_Footer {

    public function register(): void {
        add_action( 'wp_footer', [ $this, 'render_social_icons' ] );
    }

    public function render_social_icons(): void {
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

                <a href="/en/"
                   aria-label="English version"
                   target="_self">
                    <span class="ct-icon-container">
                        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-1 17.93C5.05 17.44 2 14.08 2 10c0-.34.02-.67.05-1H9v8.93zM9 7H2.46C3.56 4.11 6.05 1.96 9 1.07V7zm2 10.93V9h6.49c.03.33.05.66.05 1 0 4.08-3.05 7.44-6.54 7.93zM11 7V1.07C13.95 1.96 16.44 4.11 17.54 7H11z"/>
                        </svg>
                    </span>
                </a>

            </div>
        </div>
        <?php
    }
}
