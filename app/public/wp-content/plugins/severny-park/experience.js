(() => {
    'use strict';

    const favoriteKey = 'severny_park_favorites';
    const comparisonKey = 'severny_park_comparison_v1';
    const comparisonLimit = 3;

    function normalizeIds(values, limit = 1000) {
        if (!Array.isArray(values)) return [];
        const ids = [];
        for (const value of values) {
            const id = String(value);
            if (/^[1-9][0-9]{0,14}$/.test(id) && !ids.includes(id)) ids.push(id);
            if (ids.length >= limit) break;
        }
        return ids;
    }

    function toggleComparison(values, value, limit = comparisonLimit) {
        const ids = normalizeIds(values, limit);
        const id = String(value);
        if (!/^[1-9][0-9]{0,14}$/.test(id)) return {ids, limited: false};
        if (ids.includes(id)) return {ids: ids.filter(item => item !== id), limited: false};
        if (ids.length >= limit) return {ids, limited: true};
        return {ids: ids.concat(id), limited: false};
    }

    function displayNumber(value) {
        const text = String(value).replace(/[^0-9.,+-]/g, '').replace(',', '.');
        if (!/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(text)) return null;
        const number = Number(text);
        return Number.isFinite(number) ? number : null;
    }

    function unitPrice(price, area) {
        const cost = displayNumber(price);
        const size = displayNumber(area);
        if (cost === null || size === null || cost <= 0 || size <= 0) return '';
        const value = cost / size;
        return Number.isFinite(value)
            ? new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(value) + ' ₽/м²'
            : '';
    }

    function safeUrl(value, base) {
        try {
            const url = new URL(value, base);
            if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
            if (url.protocol === 'file:' && new URL(base).protocol === 'file:') return url.href;
        } catch { /* Неверные адреса из ответа не превращаем в ссылки. */ }
        return '';
    }

    // Чистые функции доступны тестам Node, без запуска браузерного интерфейса.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {normalizeIds, toggleComparison, displayNumber, unitPrice, safeUrl};
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    function boot() {
        if (!document.body.classList.contains('sp-experience')) return;
        const config = window.SevernyParkExperience || {};
        const previousFavorite = new WeakMap();
        const originalLabels = new WeakMap();
        let comparison = readStorage(comparisonKey, comparisonLimit).ids;
        let toastTimer;
        let activeDialog = null;
        let previousFocus = null;
        let comparisonRequest = 0;
        let galleryIndex = 0;
        const gallery = [];

        function node(tag, className, text) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (text !== undefined) element.textContent = text;
            return element;
        }

        function button(className, text) {
            const element = node('button', className, text);
            element.type = 'button';
            return element;
        }

        function readStorage(key, limit) {
            try {
                const raw = window.localStorage.getItem(key);
                let values;
                try { values = JSON.parse(raw || '[]'); } catch { values = []; }
                return {ids: normalizeIds(values, limit), available: true};
            } catch {
                return {ids: [], available: false};
            }
        }

        const toast = node('div', 'sp-toast');
        toast.hidden = true;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.setAttribute('aria-atomic', 'true');
        document.body.append(toast);

        function notify(text) {
            window.clearTimeout(toastTimer);
            toast.textContent = text;
            toast.hidden = false;
            toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
        }

        function updateFavoriteCount() {
            const count = readStorage(favoriteKey).ids.length;
            const target = safeUrl(config.favoritesUrl || '/избранное/', window.location.href);
            document.querySelectorAll('.wp-block-navigation a[href], [data-sp-favorites-link]').forEach(link => {
                let matches = link.hasAttribute('data-sp-favorites-link');
                if (!matches && target) {
                    try {
                        const current = new URL(link.href, window.location.href);
                        const expected = new URL(target);
                        matches = current.origin === expected.origin
                            && decodeURIComponent(current.pathname).replace(/\/+$/, '')
                            === decodeURIComponent(expected.pathname).replace(/\/+$/, '');
                    } catch { matches = false; }
                }
                if (!matches) return;
                if (!originalLabels.has(link)) originalLabels.set(link, link.textContent.trim());
                let badge = link.querySelector('.sp-favorites-badge');
                if (!badge) {
                    badge = node('span', 'sp-favorites-badge');
                    badge.setAttribute('aria-hidden', 'true');
                    link.append(badge);
                }
                badge.textContent = String(count);
                link.setAttribute('aria-label', originalLabels.get(link) + ', сохранено: ' + count);
            });
        }

        const tray = node('section', 'sp-compare-tray');
        tray.setAttribute('aria-label', 'Выбранные квартиры для сравнения');
        const trayText = node('p', '');
        const trayLabel = node('span', '');
        const trayHint = node('small', '');
        trayText.append(trayLabel, trayHint);
        const openComparison = button('sp-compare-open', 'Сравнить');
        const clearComparison = button('sp-compare-clear', 'Очистить');
        tray.append(trayText, openComparison, clearComparison);
        tray.hidden = true;
        document.body.append(tray);

        function saveComparison(ids) {
            comparison = normalizeIds(ids, comparisonLimit);
            try {
                window.localStorage.setItem(comparisonKey, JSON.stringify(comparison));
            } catch {
                notify('Сравнение доступно на этой странице. Браузер не разрешил сохранить выбор.');
            }
            updateComparison();
        }

        function updateComparison() {
            document.querySelectorAll('.sp-compare-toggle').forEach(control => {
                const selected = comparison.includes(control.dataset.apartmentId);
                control.setAttribute('aria-pressed', String(selected));
                control.textContent = selected ? 'В сравнении' : 'Сравнить';
            });
            tray.hidden = comparison.length === 0;
            trayLabel.textContent = 'Для сравнения: ' + comparison.length + ' из ' + comparisonLimit;
            trayHint.textContent = comparison.length < 2
                ? 'Добавьте ещё одну квартиру'
                : 'Стоимость и характеристики рядом';
            openComparison.disabled = comparison.length < 2;
            document.body.classList.toggle('sp-has-comparison', comparison.length > 0);
        }

        function enhanceCards() {
            document.querySelectorAll('.sp-favorite-toggle').forEach(favorite => {
                const id = favorite.dataset.apartmentId;
                if (!/^[1-9][0-9]{0,14}$/.test(id || '')) return;
                const container = favorite.closest('.sp-apartment-card, .sp-single-actions');
                if (!container || container.querySelector('.sp-compare-toggle')) return;
                const control = button('sp-compare-toggle', 'Сравнить');
                control.dataset.apartmentId = id;
                control.setAttribute('aria-pressed', String(comparison.includes(id)));
                favorite.insertAdjacentElement('afterend', control);
            });
            updateComparison();
        }

        function createDialog(id, title, className) {
            const dialog = node('dialog', 'sp-dialog ' + (className || ''));
            dialog.id = id;
            dialog.setAttribute('aria-labelledby', id + '-title');
            const header = node('div', 'sp-dialog-header');
            const heading = node('h2', '', title);
            heading.id = id + '-title';
            const close = button('sp-dialog-close', 'Закрыть');
            header.append(heading, close);
            dialog.append(header);
            document.body.append(dialog);
            close.addEventListener('click', () => closeDialog(dialog));
            dialog.addEventListener('close', () => {
                if (dialog === compareDialog) comparisonRequest += 1;
                if (activeDialog !== dialog) return;
                activeDialog = null;
                document.body.classList.remove('sp-modal-open');
                if (previousFocus && previousFocus.isConnected) previousFocus.focus();
            });
            dialog.addEventListener('click', event => {
                if (event.target !== dialog) return;
                const box = dialog.getBoundingClientRect();
                if (event.clientX < box.left || event.clientX > box.right
                    || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog);
            });
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeDialog(dialog);
                }
                if (event.key !== 'Tab') return;
                const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href], [tabindex="0"]')];
                if (!controls.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault(); last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault(); first.focus();
                }
            });
            return dialog;
        }

        function showDialog(dialog) {
            if (activeDialog === dialog && dialog.open) return;
            if (activeDialog) closeDialog(activeDialog);
            previousFocus = document.activeElement;
            activeDialog = dialog;
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.classList.add('sp-dialog-fallback');
                dialog.setAttribute('open', '');
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-modal', 'true');
            }
            document.body.classList.add('sp-modal-open');
            dialog.querySelector('button').focus();
        }

        function closeDialog(dialog) {
            if (!dialog.open) return;
            if (typeof dialog.close === 'function') dialog.close();
            else {
                dialog.removeAttribute('open');
                dialog.dispatchEvent(new Event('close'));
            }
        }

        const compareDialog = createDialog('sp-compare-dialog', 'Сравнение квартир');
        const compareBody = node('div', '');
        compareBody.setAttribute('aria-live', 'polite');
        compareDialog.append(compareBody);

        async function renderComparison() {
            if (comparison.length < 2) return;
            showDialog(compareDialog);
            const version = ++comparisonRequest;
            const ids = comparison.slice();
            compareBody.replaceChildren(node('p', 'sp-dialog-status', 'Загружаем характеристики…'));
            compareBody.setAttribute('aria-busy', 'true');
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 12000);
            try {
                const url = new URL(config.endpoint || '/wp-json/severny-park/v1/favorites', window.location.href);
                if (url.origin !== window.location.origin) throw new Error('unexpected_origin');
                url.searchParams.set('ids', ids.join(','));
                const response = await window.fetch(url.href, {
                    credentials: 'omit', cache: 'no-store', signal: controller.signal,
                });
                if (!response.ok) throw new Error('request_failed');
                const data = await response.json();
                if (!Array.isArray(data)) throw new Error('invalid_response');
                if (version !== comparisonRequest || !compareDialog.open) return;
                const items = ids.map(id => data.find(item => item && String(item.id) === id))
                    .filter(item => item && Array.isArray(item.details));
                if (items.length !== ids.length) {
                    saveComparison(items.map(item => item.id));
                    if (items.length < 2) {
                        closeDialog(compareDialog);
                        notify('Часть квартир больше недоступна. Выберите другие варианты в каталоге.');
                        return;
                    }
                }
                compareBody.replaceChildren(comparisonTable(items));
            } catch {
                if (version !== comparisonRequest || !compareDialog.open) return;
                const message = node('p', 'sp-dialog-status', 'Не удалось загрузить сравнение. Проверьте соединение и повторите.');
                const retry = button('sp-retry', 'Повторить');
                retry.addEventListener('click', renderComparison);
                compareBody.replaceChildren(message, retry);
            } finally {
                window.clearTimeout(timeout);
                if (version === comparisonRequest) compareBody.setAttribute('aria-busy', 'false');
            }
        }

        function comparisonTable(items) {
            const wrapper = node('div', 'sp-compare-table-scroll');
            wrapper.tabIndex = 0;
            wrapper.setAttribute('role', 'region');
            wrapper.setAttribute('aria-label', 'Таблица сравнения; на узком экране прокручивается горизонтально');
            const table = node('table', 'sp-compare-table');
            const caption = node('caption', 'screen-reader-text', 'Характеристики выбранных квартир');
            table.append(caption);
            const head = node('thead', '');
            const header = node('tr', '');
            const label = node('th', '', 'Характеристики');
            label.scope = 'col';
            header.append(label);
            for (const item of items) {
                const cell = node('th', '');
                cell.scope = 'col';
                const imageUrl = safeUrl(item.image || '', window.location.href);
                if (item.image && imageUrl) {
                    const image = node('img', '');
                    image.src = imageUrl;
                    image.alt = String(item.title || 'Вариант интерьера');
                    cell.append(image);
                }
                const link = node('a', '', String(item.title || 'Квартира'));
                const href = safeUrl(item.url || '', window.location.href);
                if (item.url && href) link.href = href;
                const remove = button('sp-compare-remove', 'Убрать');
                remove.setAttribute('aria-label', 'Убрать из сравнения: ' + String(item.title || 'квартиру'));
                remove.addEventListener('click', () => {
                    saveComparison(comparison.filter(id => id !== String(item.id)));
                    if (comparison.length < 2) {
                        closeDialog(compareDialog);
                        notify('Для сравнения выберите минимум две квартиры.');
                    } else renderComparison();
                });
                cell.append(link, remove);
                header.append(cell);
            }
            head.append(header);
            table.append(head);
            const body = node('tbody', '');
            const labels = ['Цена', 'Площадь', 'Этаж', 'Комнат', 'Цена за м²'];
            const getDetail = (item, name) => {
                const detail = item.details.find(row => row && row.label === name);
                return detail ? String(detail.value) : 'Не указано';
            };
            for (const name of labels) {
                const row = node('tr', '');
                const title = node('th', '', name);
                title.scope = 'row';
                row.append(title);
                for (const item of items) {
                    const value = name === 'Цена за м²'
                        ? unitPrice(getDetail(item, 'Цена'), getDetail(item, 'Площадь')) || 'Не указано'
                        : getDetail(item, name);
                    row.append(node('td', '', value));
                }
                body.append(row);
            }
            table.append(body);
            wrapper.append(table);
            return wrapper;
        }

        const galleryDialog = createDialog('sp-gallery-dialog', 'Фотографии квартиры', 'sp-gallery-dialog');
        const galleryFigure = node('figure', '');
        const galleryImage = node('img', '');
        const galleryCaption = node('figcaption', '');
        galleryFigure.append(galleryImage, galleryCaption);
        const galleryControls = node('div', 'sp-gallery-controls');
        const previousImage = button('', 'Предыдущее');
        const galleryCounter = node('p', '');
        const nextImage = button('', 'Следующее');
        galleryControls.append(previousImage, galleryCounter, nextImage);
        galleryDialog.append(galleryFigure, galleryControls);

        function showImage(index) {
            if (!gallery.length) return;
            galleryIndex = Math.max(0, Math.min(index, gallery.length - 1));
            const image = gallery[galleryIndex];
            galleryImage.src = image.src;
            galleryImage.alt = image.alt;
            galleryCaption.textContent = image.caption || image.alt;
            galleryCounter.textContent = String(galleryIndex + 1) + ' / ' + gallery.length;
            previousImage.disabled = galleryIndex === 0;
            nextImage.disabled = galleryIndex === gallery.length - 1;
            showDialog(galleryDialog);
        }
        previousImage.addEventListener('click', () => showImage(galleryIndex - 1));
        nextImage.addEventListener('click', () => showImage(galleryIndex + 1));
        galleryDialog.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft') { event.preventDefault(); showImage(galleryIndex - 1); }
            if (event.key === 'ArrowRight') { event.preventDefault(); showImage(galleryIndex + 1); }
        });
        galleryImage.addEventListener('error', () => {
            galleryCaption.textContent = 'Не удалось загрузить изображение. Попробуйте открыть другое.';
        });

        function enhanceGallery() {
            document.querySelectorAll('.single-sp_apartment .wp-block-gallery img, .single-sp_apartment .wp-block-post-featured-image img').forEach(image => {
                const figure = image.closest('figure');
                if (!figure || figure.dataset.spZoom || figure.closest('[data-wp-interactive="core/image"]')) return;
                const caption = figure.querySelector('figcaption');
                const parentLink = image.closest('a');
                let source = image.currentSrc || image.src;
                if (parentLink && /\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i.test(parentLink.href)) {
                    source = parentLink.href;
                }
                const url = safeUrl(source, window.location.href);
                if (!url) return;
                const index = gallery.length;
                gallery.push({src: url, alt: image.alt || 'Визуализация интерьера квартиры', caption: caption ? caption.textContent : ''});
                figure.dataset.spZoom = 'true';
                figure.classList.add('sp-zoomable');
                const zoom = button('sp-image-zoom', 'Увеличить');
                zoom.setAttribute('aria-label', 'Увеличить фотографию ' + String(index + 1));
                zoom.addEventListener('click', () => showImage(index));
                figure.append(zoom);
            });
        }

        function enhanceHomeSteps() {
            if (!document.body.classList.contains('home')) return;
            const root = document.querySelector('main .wp-block-post-content');
            if (!root || root.querySelector('.sp-choice-steps')) return;
            const headings = [...root.children].filter(element =>
                element.tagName === 'H3' && /^[123]\.\s/.test(element.textContent.trim()));
            if (headings.length !== 3 || !headings.every(heading => heading.nextElementSibling && heading.nextElementSibling.tagName === 'P')) return;
            const steps = node('div', 'sp-choice-steps');
            headings[0].before(steps);
            for (const heading of headings) {
                const paragraph = heading.nextElementSibling;
                const card = node('article', 'sp-choice-step');
                card.append(heading, paragraph);
                steps.append(card);
            }
        }

        document.addEventListener('click', event => {
            if (!(event.target instanceof Element)) return;
            const favorite = event.target.closest('.sp-favorite-toggle');
            if (favorite) previousFavorite.set(event, favorite.getAttribute('aria-pressed'));
        }, true);
        document.addEventListener('click', event => {
            if (!(event.target instanceof Element)) return;
            const control = event.target.closest('.sp-compare-toggle');
            if (control) {
                const next = toggleComparison(comparison, control.dataset.apartmentId);
                if (next.limited) notify('Можно сравнить до трёх квартир. Сначала уберите одну из выбранных.');
                else saveComparison(next.ids);
            }
            const favorite = event.target.closest('.sp-favorite-toggle');
            if (favorite) {
                updateFavoriteCount();
                const before = previousFavorite.get(event);
                const after = favorite.getAttribute('aria-pressed');
                if (before !== after) notify(after === 'true'
                    ? 'Квартира добавлена в избранное'
                    : 'Квартира убрана из избранного');
            }
        });
        openComparison.addEventListener('click', renderComparison);
        clearComparison.addEventListener('click', () => {
            comparisonRequest += 1;
            closeDialog(compareDialog);
            saveComparison([]);
        });
        window.addEventListener('storage', event => {
            if (event.key === favoriteKey || event.key === null) updateFavoriteCount();
            if (event.key === comparisonKey || event.key === null) {
                comparison = readStorage(comparisonKey, comparisonLimit).ids;
                updateComparison();
                if (compareDialog.open) {
                    if (comparison.length < 2) closeDialog(compareDialog);
                    else renderComparison();
                }
            }
        });
        window.addEventListener('pageshow', event => {
            if (!event.persisted) return;
            comparison = readStorage(comparisonKey, comparisonLimit).ids;
            enhanceCards();
            updateFavoriteCount();
        });

        enhanceCards();
        updateFavoriteCount();
        enhanceGallery();
        enhanceHomeSteps();
        const favoritesGrid = document.querySelector('.sp-favorites-grid');
        if (favoritesGrid) new MutationObserver(enhanceCards).observe(favoritesGrid, {childList: true});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
    else boot();
})();
