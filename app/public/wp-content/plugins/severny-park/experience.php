<?php
/**
 * Оформление и дополнительные инструменты выбора квартиры.
 * Не изменяет записи, шаблоны, метаполя и существующее избранное.
 */
if (!defined('ABSPATH')) {
    exit;
}

function severny_park_experience_body_class($classes) {
    $classes[] = 'sp-experience';
    return $classes;
}
add_filter('body_class', 'severny_park_experience_body_class');

function severny_park_experience_assets() {
    if (is_admin()) {
        return;
    }
    $base = plugin_dir_path(__FILE__);
    wp_enqueue_style(
        'severny-park-catalog',
        plugins_url('catalog.css', __FILE__),
        [],
        (string) filemtime($base . 'catalog.css')
    );
    wp_enqueue_style(
        'severny-park-experience',
        plugins_url('experience.css', __FILE__),
        ['severny-park-catalog'],
        (string) filemtime($base . 'experience.css')
    );

    // Шрифты Fira Sans поставляются с плагином и лицензией OFL.
    // Загружаются с самого сайта, без внешних запросов к Google.
    $font_faces = '';
    foreach (['Regular' => 400, 'Medium' => 500, 'SemiBold' => 600] as $file => $weight) {
        $relative = 'assets/fonts/FiraSans-' . $file . '.woff2';
        if (file_exists($base . $relative)) {
            $url = wp_json_encode(
                plugins_url($relative, __FILE__),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );
            $font_faces .= '@font-face{font-family:"SP Fira Sans";font-style:normal;'
                . 'font-weight:' . $weight . ';font-display:swap;src:url('
                . $url . ') format("woff2");}';
        }
    }
    if ($font_faces !== '') {
        wp_add_inline_style('severny-park-experience', $font_faces);
    }

    // Общая логика избранного нужна и на отдельной странице квартиры.
    wp_enqueue_script(
        'severny-park-favorites',
        plugins_url('favorites.js', __FILE__),
        [],
        (string) filemtime($base . 'favorites.js'),
        true
    );
    wp_enqueue_script(
        'severny-park-experience',
        plugins_url('experience.js', __FILE__),
        ['severny-park-favorites'],
        (string) filemtime($base . 'experience.js'),
        true
    );
    wp_add_inline_script(
        'severny-park-experience',
        'window.SevernyParkExperience = ' . wp_json_encode([
            'endpoint' => rest_url('severny-park/v1/favorites'),
            'favoritesUrl' => home_url('/избранное/'),
        ]) . ';',
        'before'
    );
}
add_action('wp_enqueue_scripts', 'severny_park_experience_assets', 30);

function severny_park_experience_unit_price($price, $area) {
    if (!is_numeric($price) || !is_numeric($area)) {
        return '';
    }
    $price = (float) $price;
    $area = (float) $area;
    if (!is_finite($price) || !is_finite($area) || $price <= 0 || $area <= 0) {
        return '';
    }
    $unit_price = $price / $area;
    if (!is_finite($unit_price)) {
        return '';
    }
    return number_format($unit_price, 0, ',', ' ') . ' ₽/м²';
}

function severny_park_experience_single_actions($content) {
    if (
        is_admin()
        || !is_singular('sp_apartment')
        || !is_main_query()
        || !in_the_loop()
        || post_password_required()
    ) {
        return $content;
    }
    $id = get_the_ID();
    $unit_price = severny_park_experience_unit_price(
        get_post_meta($id, 'sp_price', true),
        get_post_meta($id, 'sp_area', true)
    );
    $html = '<section class="sp-single-tools" aria-label="Инструменты выбора квартиры">';
    if ($unit_price !== '') {
        $html .= '<p class="sp-unit-price"><span>Стоимость за квадратный метр</span>'
            . '<strong>' . esc_html($unit_price) . '</strong></p>';
    }
    $html .= '<div class="sp-single-actions">';
    $html .= '<button type="button" class="sp-favorite-toggle" data-apartment-id="'
        . esc_attr($id) . '" aria-pressed="false">В избранное</button>';
    $html .= '</div></section>';
    return $content . $html;
}
add_filter('the_content', 'severny_park_experience_single_actions', 20);

function severny_park_experience_hero($content, $block) {
    if (is_admin() || !is_front_page() || !class_exists('WP_HTML_Tag_Processor')) {
        return $content;
    }
    $attrs = $block['attrs'] ?? [];
    $classes = explode(' ', $attrs['className'] ?? '');
    $is_original_hero = ($attrs['align'] ?? '') === 'wide'
        && ($attrs['style']['color']['background'] ?? '') === '#f2f6f3'
        && strpos($content, 'Найдите квартиру для вашей жизни') !== false;
    if (!$is_original_hero && !in_array('sp-home-hero', $classes, true)) {
        return $content;
    }
    $processor = new WP_HTML_Tag_Processor($content);
    if (!$processor->next_tag('div')) {
        return $content;
    }
    $processor->add_class('sp-home-hero');

    // Используется уже добавленная визуализация интерьера, без новых загрузок.
    $apartments = get_posts([
        'post_type' => 'sp_apartment',
        'post_status' => 'publish',
        'has_password' => false,
        'posts_per_page' => 1,
        'meta_key' => '_thumbnail_id',
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]);
    $image = '';
    if ($apartments) {
        $image = get_the_post_thumbnail($apartments[0]->ID, 'large', [
            'class' => 'sp-hero-image',
            'loading' => 'eager',
            'fetchpriority' => 'high',
            'alt' => 'Демонстрационный вариант интерьера квартиры',
        ]);
    }
    if ($image !== '') {
        $processor->add_class('sp-hero-has-image');
    }
    $content = $processor->get_updated_html();
    if ($image !== '' && strpos($content, 'sp-hero-visual') === false) {
        $position = strrpos($content, '</div>');
        if ($position !== false) {
            $visual = '<figure class="sp-hero-visual">' . $image
                . '<figcaption>Пространство, которое станет вашим'
                . '<span>Визуализация интерьера · учебный проект</span>'
                . '</figcaption></figure>';
            $content = substr_replace($content, $visual, $position, 0);
        }
    }
    return $content;
}
add_filter('render_block_core/group', 'severny_park_experience_hero', 20, 2);

function severny_park_experience_catalog_summary($content, $block) {
    if (
        is_admin()
        || !is_post_type_archive('sp_apartment')
        || empty($block['attrs']['query']['inherit'])
    ) {
        return $content;
    }
    global $wp_query;
    $count = isset($wp_query->found_posts) ? absint($wp_query->found_posts) : 0;
    return '<div class="sp-catalog-summary"><p>Подходит квартир: <strong>'
        . esc_html($count) . '</strong></p>'
        . '<p>Сохраните понравившееся или сравните до трёх вариантов.</p></div>'
        . $content;
}
add_filter('render_block_core/query', 'severny_park_experience_catalog_summary', 20, 2);
