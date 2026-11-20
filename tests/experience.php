<?php
/** Проверка нового PHP-слоя с настоящим HTML Tag Processor из WordPress. */
define('ABSPATH', dirname(__DIR__) . '/app/public/');
define('WPINC', 'wp-includes');
$context = [
    'admin' => false, 'single' => true, 'main' => true, 'loop' => true,
    'password' => false, 'front' => false, 'archive' => false,
    'price' => '8500000', 'area' => '42.5', 'image' => '<img src="/interior.png" alt="Интерьер">',
];
$styles = [];
$scripts = [];
$inline_scripts = [];
$queries = [];
function add_filter(...$args) {}
function add_action(...$args) {}
function is_admin() { return $GLOBALS['context']['admin']; }
function is_singular($type) { return $GLOBALS['context']['single'] && $type === 'sp_apartment'; }
function is_main_query() { return $GLOBALS['context']['main']; }
function in_the_loop() { return $GLOBALS['context']['loop']; }
function post_password_required() { return $GLOBALS['context']['password']; }
function is_front_page() { return $GLOBALS['context']['front']; }
function is_post_type_archive($type) { return $GLOBALS['context']['archive'] && $type === 'sp_apartment'; }
function get_the_ID() { return 21; }
function get_post_meta($id, $key, $single) {
    return $GLOBALS['context'][$key === 'sp_price' ? 'price' : 'area'];
}
function esc_html($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function esc_attr($value) { return esc_html($value); }
function absint($value) { return abs((int) $value); }
function plugin_dir_path($file) { return dirname($file) . '/'; }
function plugins_url($path, $file) { return 'https://example.test/subdir/wp-content/plugins/severny-park/' . $path; }
function wp_enqueue_style($handle, $url, $deps, $version) { $GLOBALS['styles'][$handle] = [$url, $deps, $version]; }
function wp_enqueue_script($handle, $url, $deps, $version, $footer) { $GLOBALS['scripts'][$handle] = [$url, $deps, $version, $footer]; }
function wp_add_inline_style($handle, $value) { $GLOBALS['inline_style'] = $value; }
function wp_add_inline_script($handle, $value, $position) { $GLOBALS['inline_scripts'][$handle] = [$value, $position]; }
function wp_json_encode($value, $flags = 0) { return json_encode($value, $flags); }
function rest_url($path) { return 'https://example.test/subdir/wp-json/' . $path; }
function home_url($path) { return 'https://example.test/subdir' . $path; }
function get_posts($query) { $GLOBALS['queries'][] = $query; return [(object) ['ID' => 21]]; }
function get_the_post_thumbnail($id, $size, $attrs) { return $GLOBALS['context']['image']; }
function __($text) { return $text; }
function _doing_it_wrong($function, $message, $version) { throw new RuntimeException($function . ': ' . $message); }
spl_autoload_register(function ($class) {
    if (!str_starts_with($class, 'WP_HTML_')) return;
    $path = ABSPATH . WPINC . '/html-api/class-' . strtolower(str_replace('_', '-', $class)) . '.php';
    if (is_file($path)) require_once $path;
});
$entities = ABSPATH . WPINC . '/html-api/html5-named-character-references.php';
if (is_file($entities)) require_once $entities;
require dirname(__DIR__) . '/app/public/wp-content/plugins/severny-park/experience.php';

function check($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
check(severny_park_experience_unit_price('8500000', '42.5') === '200 000 ₽/м²', 'Decimal area was lost');
check(severny_park_experience_unit_price('9100000', '46') === '197 826 ₽/м²', 'Rounded unit price differs');
foreach (['', 'wrong', '0', '-1', INF, NAN] as $area) {
    check(severny_park_experience_unit_price('8500000', $area) === '', 'Invalid area exposed a unit price');
}
foreach (['admin', 'password'] as $guard) {
    $context[$guard] = true;
    check(severny_park_experience_single_actions('original') === 'original', 'Guard failed: ' . $guard);
    $context[$guard] = false;
}
foreach (['single', 'main', 'loop'] as $guard) {
    $context[$guard] = false;
    check(severny_park_experience_single_actions('original') === 'original', 'Guard failed: ' . $guard);
    $context[$guard] = true;
}
$single = severny_park_experience_single_actions('original');
check(str_starts_with($single, 'original'), 'Original content changed');
check(str_contains($single, 'data-apartment-id="21"'), 'Single apartment favorite has no ID');
check(str_contains($single, '200 000 ₽/м²'), 'Single apartment unit price is missing');

severny_park_experience_assets();
check(isset($scripts['severny-park-favorites']), 'Existing favorites script is not loaded on single pages');
check($scripts['severny-park-experience'][1] === ['severny-park-favorites'], 'Favorite script order changed');
$config = $inline_scripts['severny-park-experience'];
check($config[1] === 'before', 'REST configuration is printed too late');
check(str_contains($config[0], 'subdir\\/wp-json\\/severny-park\\/v1\\/favorites'), 'WordPress subdirectory was lost');
check(substr_count($GLOBALS['inline_style'], '@font-face') === 3, 'Bundled local fonts are missing');

$context['front'] = true;
$block = ['attrs' => ['align' => 'wide', 'style' => ['color' => ['background' => '#f2f6f3']]]];
$original = '<div class="wp-block-group"><h1>Найдите квартиру для вашей жизни</h1><p>Описание</p></div>';
$hero = severny_park_experience_hero($original, $block);
check(str_contains($hero, 'sp-home-hero'), 'Home hero class is missing');
check(substr_count($hero, '<figure class="sp-hero-visual">') === 1, 'Hero image missing or duplicated');
check(str_contains($hero, '<p>Описание</p>'), 'Existing home copy changed');
check(substr_count(severny_park_experience_hero($hero, $block), '<figure class="sp-hero-visual">') === 1, 'Repeated rendering duplicates the image');
$query = $queries[0];
check($query['post_status'] === 'publish' && $query['has_password'] === false, 'Hero may expose an unpublished image');
check(severny_park_experience_hero($original, ['attrs' => []]) === $original, 'An unrelated block was changed');
$context['image'] = '';
$empty = severny_park_experience_hero($original, $block);
check(str_contains($empty, 'sp-home-hero') && !str_contains($empty, 'sp-hero-has-image'), 'Missing image breaks the hero fallback');
$context['front'] = false;
check(severny_park_experience_hero($original, $block) === $original, 'Hero leaks onto other pages');

$context['archive'] = true;
$wp_query = (object) ['found_posts' => 5];
$summary = severny_park_experience_catalog_summary('query', ['attrs' => ['query' => ['inherit' => true]]]);
check(str_contains($summary, '<strong>5</strong>'), 'Filtered catalog count is missing');
check(severny_park_experience_catalog_summary('secondary', ['attrs' => []]) === 'secondary', 'A secondary query was decorated');
echo "PHP checks passed: price, protected content, assets, WordPress HTML processing, catalog.\n";
