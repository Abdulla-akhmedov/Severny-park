const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeIds, toggleComparison, displayNumber, unitPrice, safeUrl,
} = require('../app/public/wp-content/plugins/severny-park/experience.js');

test('storage accepts unique positive WordPress IDs and discards malformed values', () => {
    assert.deepEqual(normalizeIds(['21', 26, '21', '0', '-1', '1.5', 'x', null, '1234567890123456']), ['21', '26']);
    for (const value of [null, {}, '21,26', 21]) assert.deepEqual(normalizeIds(value), []);
});
test('adding a fourth comparison does not silently remove an earlier selection', () => {
    assert.deepEqual(toggleComparison(['21', '26', '28'], '30'), {
        ids: ['21', '26', '28'], limited: true,
    });
});
test('selected comparison can be removed, and another apartment can take its place', () => {
    const removed = toggleComparison(['21', '26', '28'], '26');
    assert.deepEqual(removed, {ids: ['21', '28'], limited: false});
    assert.deepEqual(toggleComparison(removed.ids, '30').ids, ['21', '28', '30']);
});
test('malformed selections cannot become REST query IDs', () => {
    assert.deepEqual(toggleComparison(['21', '21', 'bad'], '1&ids=2').ids, ['21']);
    assert.deepEqual(normalizeIds(['21', '26', '28', '30'], 3), ['21', '26', '28']);
});
test('Russian price and area formatting is understood without losing decimal area', () => {
    assert.equal(displayNumber('8 500 000 ₽'), 8500000);
    assert.equal(displayNumber('42,5 м²'), 42.5);
    assert.equal(displayNumber('8\u00a0500\u00a0000 ₽'), 8500000);
    assert.equal(displayNumber('1,2,3'), null);
    assert.equal(displayNumber('Не указано'), null);
});
test('price per square metre uses area, with matching rounded results', () => {
    assert.equal(unitPrice('8 500 000 ₽', '42,5 м²').replace(/\s/g, ' '), '200 000 ₽/м²');
    assert.equal(unitPrice('9 100 000 ₽', '46 м²').replace(/\s/g, ' '), '197 826 ₽/м²');
});
test('missing and zero areas never produce Infinity or a made-up unit price', () => {
    for (const area of ['0', '-5', 'Не указано', Infinity]) {
        assert.equal(unitPrice('8 500 000 ₽', area), '');
    }
    assert.equal(unitPrice('Не указано', '42,5 м²'), '');
    assert.equal(unitPrice('-1 ₽', '42,5 м²'), '');
});
test('remote titles cannot turn comparison links into executable URLs', () => {
    const base = 'https://example.test/subdir/apartments/';
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd']) {
        assert.equal(safeUrl(url, base), '');
    }
    assert.equal(safeUrl('../apartment-21/', base), 'https://example.test/subdir/apartment-21/');
});
test('downloaded HTML preview can resolve its own relative links', () => {
    assert.equal(safeUrl('index.html#catalog', 'file:///tmp/demo/index.html'), 'file:///tmp/demo/index.html#catalog');
});
