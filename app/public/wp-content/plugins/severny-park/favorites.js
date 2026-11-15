(() => {
    const storageKey = 'severny_park_favorites';

    function readFavorites() {
        const raw = localStorage.getItem(storageKey);
        let values;

        try {
            values = JSON.parse(raw || '[]');
        } catch {
            return [];
        }

        if (!Array.isArray(values)) {
            return [];
        }

        return [...new Set(
            values.map(String).filter(id => /^[1-9]\d*$/.test(id))
        )];
    }

    function syncButtons() {
        const buttons = document.querySelectorAll('.sp-favorite-toggle');

        try {
            const favorites = readFavorites();

            buttons.forEach(button => {
                const selected = favorites.includes(
                    button.dataset.apartmentId
                );

                button.setAttribute('aria-pressed', String(selected));
                button.textContent = selected
                    ? 'В избранном — убрать'
                    : 'В избранное';
            });
        } catch {
            buttons.forEach(button => {
                button.disabled = true;
                button.textContent = 'Избранное недоступно';
            });
        }
    }

    document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest('.sp-favorite-toggle');

        if (!button) {
            return;
        }

        const id = button.dataset.apartmentId;

        try {
            let favorites = readFavorites();

            if (favorites.includes(id)) {
                favorites = favorites.filter(value => value !== id);
            } else {
                favorites.push(id);
            }

            localStorage.setItem(storageKey, JSON.stringify(favorites));
            syncButtons();
        } catch {
            alert('Не удалось сохранить избранное. Разреши сайту хранить данные в браузере.');
        }
    });

    window.addEventListener('storage', event => {
        if (event.key === storageKey || event.key === null) {
            syncButtons();
        }
    });

    syncButtons();
})();