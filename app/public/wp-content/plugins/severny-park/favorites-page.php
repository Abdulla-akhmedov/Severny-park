<?php
/**
 * Страница избранного. Подключается из severny-park.php через require_once.
 * Использует существующий favorites.js и его ключ severny_park_favorites.
 */
if (!defined('ABSPATH')) {
    exit;
}

function severny_park_favorites_format_value($key, $value) {
    if ($value === '' || !is_numeric($value)) {
        return 'Не указано';
    }
    if ($key === 'sp_price') {
        return number_format((float) $value, 0, ',', ' ') . ' ₽';
    }
    if ($key === 'sp_area') {
        $area = number_format((float) $value, 2, ',', ' ');
        return rtrim(rtrim($area, '0'), ',') . ' м²';
    }
    if ($key === 'sp_rooms' && (int) $value === 0) {
        return 'Студия';
    }
    return (string) (int) $value;
}

function severny_park_favorites_rest_items($request) {
    $ids = array_values(array_unique(array_map(
        'absint', explode(',', $request->get_param('ids'))
    )));
    // Важно: пустой post__in не ограничивает WP_Query, поэтому пустой ввод
    // также отсекается валидатором маршрута.
    if (!$ids) {
        return rest_ensure_response([]);
    }
    $posts = get_posts([
        'post_type' => 'sp_apartment',
        'post_status' => 'publish',
        'has_password' => false,
        'post__in' => $ids,
        'orderby' => 'post__in',
        'posts_per_page' => count($ids),
        'no_found_rows' => true,
        'ignore_sticky_posts' => true,
    ]);
    $labels = [
        'sp_price' => 'Цена',
        'sp_area' => 'Площадь',
        'sp_floor' => 'Этаж',
        'sp_rooms' => 'Комнат',
    ];
    $items = [];
    foreach ($posts as $post) {
        $details = [];
        foreach ($labels as $key => $label) {
            $details[] = [
                'label' => $label,
                'value' => severny_park_favorites_format_value(
                    $key, get_post_meta($post->ID, $key, true)
                ),
            ];
        }
        $items[] = [
            'id' => (string) $post->ID,
            'title' => $post->post_title,
            'url' => get_permalink($post->ID),
            'image' => get_the_post_thumbnail_url($post->ID, 'medium_large') ?: '',
            'details' => $details,
        ];
    }
    $response = rest_ensure_response($items);
    $response->header('Cache-Control', 'no-store');
    return $response;
}

function severny_park_register_favorites_route() {
    register_rest_route('severny-park/v1', '/favorites', [
        'methods' => 'GET',
        'callback' => 'severny_park_favorites_rest_items',
        // Это публичные сведения о опубликованных квартирах, без контактов.
        'permission_callback' => '__return_true',
        'args' => [
            'ids' => [
                'required' => true,
                'type' => 'string',
                'validate_callback' => function ($value) {
                    return is_string($value)
                        && strlen($value) <= 1600
                        && preg_match('/^[1-9][0-9]{0,14}(?:,[1-9][0-9]{0,14}){0,99}$/D', $value) === 1;
                },
            ],
        ],
    ]);
}
add_action('rest_api_init', 'severny_park_register_favorites_route');

function severny_park_favorites_page_shortcode() {
    $html = '<div class="sp-favorites-page" data-endpoint="';
    $html .= esc_url(rest_url('severny-park/v1/favorites')) . '">';
    $html .= '<p class="sp-favorites-status" role="status">Загружаем избранное…</p>';
    $html .= '<div class="sp-favorites-grid" aria-busy="true"></div>';
    $html .= '<noscript>Для просмотра избранного включите JavaScript в браузере.</noscript>';
    $html .= '</div>';
    return $html;
}
add_shortcode('sp_favorites', 'severny_park_favorites_page_shortcode');

function severny_park_enqueue_favorites_page_assets() {
    if (!is_page() || !has_shortcode(
        (string) get_post_field('post_content', get_queried_object_id()),
        'sp_favorites'
    )) {
        return;
    }
    $base = plugin_dir_path(__FILE__);
    wp_enqueue_style('severny-park-catalog', plugins_url('catalog.css', __FILE__), [], (string) filemtime($base . 'catalog.css'));
    wp_enqueue_style('severny-park-favorites-page', plugins_url('favorites-page.css', __FILE__), ['severny-park-catalog'], (string) filemtime($base . 'favorites-page.css'));
    // Та же логика кнопок, что уже используется в каталоге.
    wp_enqueue_script('severny-park-favorites', plugins_url('favorites.js', __FILE__), [], (string) filemtime($base . 'favorites.js'), true);
    wp_enqueue_script('severny-park-favorites-page', plugins_url('favorites-page.js', __FILE__), ['severny-park-favorites'], (string) filemtime($base . 'favorites-page.js'), true);
}
add_action('wp_enqueue_scripts', 'severny_park_enqueue_favorites_page_assets');
