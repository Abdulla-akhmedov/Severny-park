<?php
/**
 * Plugin Name: Северный парк — каталог квартир
 * Description: Управление квартирами жилого комплекса.
 * Version: 0.2.0
 * Author: Ахмедов Абдулла
 */

if (!defined('ABSPATH')) {
    exit;
}

function severny_park_register_apartments() {
    register_post_type('sp_apartment', [
        'labels' => [
            'name'          => 'Квартиры',
            'singular_name' => 'Квартира',
            'add_new'       => 'Добавить квартиру',
            'add_new_item'  => 'Добавить квартиру',
            'edit_item'     => 'Редактировать квартиру',
            'all_items'     => 'Все квартиры',
            'not_found'     => 'Квартиры не найдены',
        ],
        'public'       => true,
        'show_in_rest' => true,
        'menu_icon'    => 'dashicons-building',
        'has_archive'  => true,
        'rewrite'      => ['slug' => 'apartments'],
        'supports'     => ['title', 'editor', 'thumbnail', 'revisions'],
    ]);
}

add_action('init', 'severny_park_register_apartments');

// Описание полей: название, минимальное значение, шаг.
function severny_park_apartment_fields() {
    return [
        'sp_price' => ['Цена, ₽', 1, 1],
        'sp_area'  => ['Площадь, м²', 0.01, 0.01],
        'sp_floor' => ['Этаж', 1, 1],
        'sp_rooms' => ['Количество комнат (0 — студия)', 0, 1],
    ];
}

// Добавляем блок в редактор квартиры.
function severny_park_add_details_box() {
    add_meta_box(
        'sp_apartment_details',
        'Характеристики квартиры',
        'severny_park_render_details',
        'sp_apartment',
        'normal',
        'high'
    );
}

add_action('add_meta_boxes', 'severny_park_add_details_box');

// Показываем поля и ранее сохранённые значения.
function severny_park_render_details($post) {
    wp_nonce_field('sp_save_details', 'sp_details_nonce');

    foreach (severny_park_apartment_fields() as $key => $field) {
        [$label, $min, $step] = $field;
        $value = get_post_meta($post->ID, $key, true);

        printf(
            '<p>
                <label for="%1$s">%2$s</label><br>
                <input type="number" id="%1$s" name="%1$s"
                    value="%3$s" min="%4$s" step="%5$s">
            </p>',
            esc_attr($key),
            esc_html($label),
            esc_attr($value),
            esc_attr($min),
            esc_attr($step)
        );
    }
}

// Проверяем запрос и сохраняем характеристики.
function severny_park_save_details($post_id) {
    if (
        (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)
        || wp_is_post_revision($post_id)
        || !current_user_can('edit_post', $post_id)
    ) {
        return;
    }

    if (
        !isset($_POST['sp_details_nonce'])
        || !is_string($_POST['sp_details_nonce'])
        || !wp_verify_nonce(
            wp_unslash($_POST['sp_details_nonce']),
            'sp_save_details'
        )
    ) {
        return;
    }

    foreach (severny_park_apartment_fields() as $key => $field) {
        if (!isset($_POST[$key]) || !is_string($_POST[$key])) {
            continue;
        }

        $raw = str_replace(',', '.', trim(wp_unslash($_POST[$key])));

        if ($raw === '') {
            delete_post_meta($post_id, $key);
            continue;
        }

        $pattern = $field[2] === 1
            ? '/^\d+$/D'
            : '/^\d+(?:\.\d{1,2})?$/D';

        if (!preg_match($pattern, $raw)) {
            continue;
        }

        $number = (float) $raw;

        if (!is_finite($number) || $number < $field[1]) {
            continue;
        }

        update_post_meta($post_id, $key, $raw);
    }
}

add_action('save_post_sp_apartment', 'severny_park_save_details');

// Выводим характеристики на странице отдельной квартиры.
function severny_park_show_apartment_details($content) {
    if (
        is_admin()
        || !is_singular('sp_apartment')
        || !is_main_query()
        || !in_the_loop()
        || post_password_required()
    ) {
        return $content;
    }

    $post_id = get_the_ID();

    $fields = [
        'sp_price' => 'Цена',
        'sp_area'  => 'Площадь',
        'sp_floor' => 'Этаж',
        'sp_rooms' => 'Количество комнат',
    ];

    $html = '<section class="sp-apartment-details">';
    $html .= '<h2>Характеристики квартиры</h2>';
    $html .= '<table><tbody>';

    foreach ($fields as $key => $label) {
        $value = get_post_meta($post_id, $key, true);

        if ($value === '' || !is_numeric($value)) {
            $display = 'Не указано';
        } elseif ($key === 'sp_price') {
            $display = number_format((float) $value, 0, ',', ' ') . ' ₽';
        } elseif ($key === 'sp_area') {
            $area = number_format((float) $value, 2, ',', ' ');
            $display = rtrim(rtrim($area, '0'), ',') . ' м²';
        } elseif ($key === 'sp_rooms' && (int) $value === 0) {
            $display = 'Студия';
        } else {
            $display = (string) (int) $value;
        }

        $html .= '<tr>';
        $html .= '<th scope="row">' . esc_html($label) . '</th>';
        $html .= '<td>' . esc_html($display) . '</td>';
        $html .= '</tr>';
    }

    $html .= '</tbody></table></section>';

    return $content . $html;
}

add_filter('the_content', 'severny_park_show_apartment_details');

// Добавляем характеристики к заголовку карточки в каталоге.
function severny_park_render_card_details($content, $block, $instance) {
    if (is_admin() || !is_post_type_archive('sp_apartment')) {
        return $content;
    }

    $classes = explode(' ', $block['attrs']['className'] ?? '');

    if (!in_array('sp-apartment-card-title', $classes, true)) {
        return $content;
    }

    // Получаем ID именно той квартиры, которую выводит цикл.
    $post_id = absint($instance->context['postId'] ?? 0);

    if (
        !$post_id
        || get_post_type($post_id) !== 'sp_apartment'
        || post_password_required($post_id)
    ) {
        return $content;
    }

    $fields = [
        'sp_price' => 'Цена',
        'sp_area'  => 'Площадь',
        'sp_floor' => 'Этаж',
        'sp_rooms' => 'Комнат',
    ];

    $html = '<div class="sp-apartment-card-meta">';

    foreach ($fields as $key => $label) {
        $value = get_post_meta($post_id, $key, true);

        if ($value === '' || !is_numeric($value)) {
            $display = 'Не указано';
        } elseif ($key === 'sp_price') {
            $display = number_format((float) $value, 0, ',', ' ') . ' ₽';
        } elseif ($key === 'sp_area') {
            $area = number_format((float) $value, 2, ',', ' ');
            $display = rtrim(rtrim($area, '0'), ',') . ' м²';
        } elseif ($key === 'sp_rooms' && (int) $value === 0) {
            $display = 'Студия';
        } else {
            $display = (string) (int) $value;
        }

        $html .= '<p><strong>' . esc_html($label) . ':</strong> ';
        $html .= esc_html($display) . '</p>';
    }

    $html .= '</div>';

$html .= '<button type="button" class="sp-favorite-toggle"';
$html .= ' data-apartment-id="' . esc_attr($post_id) . '"';
$html .= ' aria-pressed="false">В избранное</button>';

return $content . $html;
}

add_filter(
    'render_block_core/post-title',
    'severny_park_render_card_details',
    10,
    3
);

// Подключаем оформление только на странице каталога.
function severny_park_enqueue_catalog_styles() {
    if (
    !is_post_type_archive('sp_apartment')
    && !is_singular('sp_apartment')
) {
    return;
}

    $css_path = plugin_dir_path(__FILE__) . 'catalog.css';

    if (!file_exists($css_path)) {
        return;
    }

    wp_enqueue_style(
        'severny-park-catalog',
        plugins_url('catalog.css', __FILE__),
        [],
        (string) filemtime($css_path)
    );
}

add_action(
    'wp_enqueue_scripts',
    'severny_park_enqueue_catalog_styles'
);

// Фильтруем основной запрос каталога по количеству комнат.
function severny_park_filter_apartments($query) {
    if (
        is_admin()
        || !$query->is_main_query()
        || !$query->is_post_type_archive('sp_apartment')
    ) {
        return;
    }

    if (
        !isset($_GET['sp_rooms'])
        || !is_string($_GET['sp_rooms'])
    ) {
        return;
    }

    $rooms = wp_unslash($_GET['sp_rooms']);

    if (!in_array($rooms, ['0', '1', '2', '3'], true)) {
        return;
    }

    $filters = [
        'relation' => 'AND',
        [
            'key'     => 'sp_rooms',
            'value'   => (int) $rooms,
            'compare' => '=',
            'type'    => 'NUMERIC',
        ],
    ];

    $existing = $query->get('meta_query');

    if (is_array($existing) && $existing) {
        $filters[] = $existing;
    }

    $query->set('meta_query', $filters);
}

add_action('pre_get_posts', 'severny_park_filter_apartments');

// Форма выбора количества комнат.
function severny_park_rooms_filter_form() {
    if (!is_post_type_archive('sp_apartment')) {
        return '';
    }

    $current = '';

    if (isset($_GET['sp_rooms']) && is_string($_GET['sp_rooms'])) {
        $current = wp_unslash($_GET['sp_rooms']);
    }

    if (!in_array($current, ['0', '1', '2', '3'], true)) {
        $current = '';
    }

    $options = [
        ''  => 'Все квартиры',
        '0' => 'Студия',
        '1' => '1 комната',
        '2' => '2 комнаты',
        '3' => '3 комнаты',
    ];

    $url = get_post_type_archive_link('sp_apartment');

    $html = '<form class="sp-catalog-filters" method="get" action="';
    $html .= esc_url($url) . '">';
    $html .= '<div>';
    $html .= '<label for="sp-filter-rooms">Количество комнат</label>';
    $html .= '<select id="sp-filter-rooms" name="sp_rooms">';

    foreach ($options as $value => $label) {
        $html .= '<option value="' . esc_attr($value) . '"';
        $html .= selected($current, (string) $value, false);
        $html .= '>' . esc_html($label) . '</option>';
    }

    $html .= '</select></div>';
    foreach ([
    'sp_price_min' => 'Цена от, ₽',
    'sp_price_max' => 'Цена до, ₽',
] as $name => $label) {
    $value = severny_park_get_price_filter($name);

    $html .= '<div>';
    $html .= '<label for="' . esc_attr($name) . '">';
    $html .= esc_html($label) . '</label>';
    $html .= '<input type="number" id="' . esc_attr($name) . '"';
    $html .= ' name="' . esc_attr($name) . '"';
    $html .= ' value="' . esc_attr($value) . '"';
    $html .= ' min="0" max="999999999999" step="1"';
    $html .= ' placeholder="Без ограничения">';
    $html .= '</div>';
}
$sort_options = [
    ''           => 'Сначала новые',
    'price_asc'  => 'Сначала дешевле',
    'price_desc' => 'Сначала дороже',
    'area_asc'   => 'Сначала меньше по площади',
];

$sort = '';

if (isset($_GET['sp_sort']) && is_string($_GET['sp_sort'])) {
    $sort = wp_unslash($_GET['sp_sort']);
}

if (!array_key_exists($sort, $sort_options)) {
    $sort = '';
}

$html .= '<div>';
$html .= '<label for="sp-filter-sort">Сортировка</label>';
$html .= '<select id="sp-filter-sort" name="sp_sort">';

foreach ($sort_options as $value => $label) {
    $html .= '<option value="' . esc_attr($value) . '"';
    $html .= selected($sort, $value, false);
    $html .= '>' . esc_html($label) . '</option>';
}

$html .= '</select></div>';
    $html .= '<button type="submit">Показать</button>';
    $html .= '<a href="' . esc_url($url) . '">Сбросить</a>';
    $html .= '</form>';

    return $html;
}

add_shortcode('sp_rooms_filter', 'severny_park_rooms_filter_form');

// Читаем цену из адреса: только целое неотрицательное число.
function severny_park_get_price_filter($name) {
    if (!isset($_GET[$name]) || !is_string($_GET[$name])) {
        return '';
    }

    $value = trim(wp_unslash($_GET[$name]));

    if (!preg_match('/^[0-9]{1,12}$/D', $value)) {
        return '';
    }

    return (string) (int) $value;
}

// Добавляем ограничения цены к уже выбранным комнатам.
function severny_park_filter_prices($query) {
    if (
        is_admin()
        || !$query->is_main_query()
        || !$query->is_post_type_archive('sp_apartment')
    ) {
        return;
    }

    $filters = ['relation' => 'AND'];

    foreach ([
        'sp_price_min' => '>=',
        'sp_price_max' => '<=',
    ] as $name => $comparison) {
        $value = severny_park_get_price_filter($name);

        if ($value !== '') {
            $filters[] = [
                'key'     => 'sp_price',
                'value'   => $value,
                'compare' => $comparison,
                'type'    => 'NUMERIC',
            ];
        }
    }

    if (count($filters) === 1) {
        return;
    }

    $existing = $query->get('meta_query');

    if (is_array($existing) && $existing) {
        $filters = [
            'relation' => 'AND',
            $existing,
            $filters,
        ];
    }

    $query->set('meta_query', $filters);
}

add_action('pre_get_posts', 'severny_park_filter_prices', 20);

// Сортировка квартир в каталоге.
function severny_park_sort_apartments($query) {
    if (
        is_admin()
        || !$query->is_main_query()
        || !$query->is_post_type_archive('sp_apartment')
    ) {
        return;
    }

    if (!isset($_GET['sp_sort']) || !is_string($_GET['sp_sort'])) {
        return;
    }

    $sort = wp_unslash($_GET['sp_sort']);

    $options = [
        'price_asc'  => ['sp_price', 'ASC'],
        'price_desc' => ['sp_price', 'DESC'],
        'area_asc'   => ['sp_area', 'ASC'],
    ];

    if (!isset($options[$sort])) {
        return;
    }

    [$field, $direction] = $options[$sort];

    $query->set('meta_key', $field);
    $query->set('orderby', [
        'meta_value_num' => $direction,
        'ID' => 'ASC',
    ]);
}

add_action('pre_get_posts', 'severny_park_sort_apartments', 30);

function severny_park_enqueue_favorites_script() {
    if (!is_post_type_archive('sp_apartment')) {
        return;
    }

    $path = plugin_dir_path(__FILE__) . 'favorites.js';

    if (!file_exists($path)) {
        return;
    }

    wp_enqueue_script(
        'severny-park-favorites',
        plugins_url('favorites.js', __FILE__),
        [],
        (string) filemtime($path),
        true
    );
}

add_action(
    'wp_enqueue_scripts',
    'severny_park_enqueue_favorites_script'
);

require_once __DIR__ . '/favorites-page.php';
require_once __DIR__ . '/experience.php';
