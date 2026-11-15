(() => {
    const root = document.querySelector('.sp-favorites-page');
    if (!root) return;
    const grid = root.querySelector('.sp-favorites-grid');
    const status = root.querySelector('.sp-favorites-status');
    const storageKey = 'severny_park_favorites';
    let requestVersion = 0;

    function readIds() {
        const raw = localStorage.getItem(storageKey);
        let ids;
        try {
            ids = JSON.parse(raw || '[]');
        } catch {
            return [];
        }
        return Array.isArray(ids)
            ? [...new Set(ids.map(String).filter(id => /^[1-9][0-9]{0,14}$/.test(id)))]
            : [];
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderCard(item) {
        const card = element('article', 'sp-apartment-card');
        card.dataset.apartmentId = item.id;
        if (item.image) {
            const figure = element('figure', 'wp-block-post-featured-image');
            const imageLink = element('a', '');
            imageLink.href = item.url;
            const image = element('img', '');
            image.src = item.image;
            image.alt = item.title;
            image.loading = 'lazy';
            imageLink.append(image);
            figure.append(imageLink);
            card.append(figure);
        }
        const heading = element('h2', 'wp-block-post-title');
        const titleLink = element('a', '', item.title);
        titleLink.href = item.url;
        heading.append(titleLink);
        const meta = element('div', 'sp-apartment-card-meta');
        for (const detail of item.details) {
            const row = element('p', '');
            row.append(element('strong', '', detail.label + ': '));
            row.append(document.createTextNode(detail.value));
            meta.append(row);
        }
        const favorite = element('button', 'sp-favorite-toggle', 'В избранном — убрать');
        favorite.type = 'button';
        favorite.dataset.apartmentId = item.id;
        favorite.setAttribute('aria-pressed', 'true');
        const more = element('a', 'wp-block-read-more', 'Подробнее о квартире');
        more.href = item.url;
        card.append(heading, meta, favorite, more);
        return card;
    }

    function showCount() {
        const count = grid.children.length;
        status.textContent = count
            ? `Квартир в избранном: ${count}`
            : 'В избранном пока нет доступных квартир. Добавьте их в каталоге.';
    }

    async function loadFavorites() {
        const version = ++requestVersion;
        grid.setAttribute('aria-busy', 'true');
        grid.replaceChildren();
        status.textContent = 'Загружаем избранное…';
        try {
            const ids = readIds();
            const items = [];
            // API принимает до 100 ID за запрос; большой список загружаем частями.
            for (let offset = 0; offset < ids.length; offset += 100) {
                if (version !== requestVersion) return;
                const url = new URL(root.dataset.endpoint, window.location.href);
                url.searchParams.set('ids', ids.slice(offset, offset + 100).join(','));
                const response = await fetch(url, {cache: 'no-store', credentials: 'omit'});
                if (!response.ok) throw new Error('request_failed');
                const batch = await response.json();
                if (!Array.isArray(batch)) throw new Error('invalid_response');
                items.push(...batch);
            }
            if (version !== requestVersion) return;
            const fragment = document.createDocumentFragment();
            for (const item of items) fragment.append(renderCard(item));
            grid.replaceChildren(fragment);
            showCount();
        } catch {
            if (version !== requestVersion) return;
            status.textContent = 'Не удалось загрузить избранное. Обновите страницу и проверьте, разрешено ли браузеру сохранять данные сайта.';
        } finally {
            if (version === requestVersion) grid.setAttribute('aria-busy', 'false');
        }
    }

    // favorites.js загружается раньше и сначала сохраняет изменение выбора.
    document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('.sp-favorite-toggle');
        if (!button || !grid.contains(button)) return;
        if (button.getAttribute('aria-pressed') === 'false') {
            button.closest('.sp-apartment-card').remove();
            showCount();
        }
    });
    window.addEventListener('storage', event => {
        if (event.key === storageKey || event.key === null) loadFavorites();
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted) loadFavorites();
    });
    loadFavorites();
})();
