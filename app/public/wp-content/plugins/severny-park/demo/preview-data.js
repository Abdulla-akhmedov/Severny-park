(() => {
    'use strict';
    const items = [
  {
    "id": "21",
    "title": "Квартира №1",
    "url": "#apartment-21",
    "image": "assets/apartment-21.png",
    "details": [
      {
        "label": "Цена",
        "value": "8 500 000 ₽"
      },
      {
        "label": "Площадь",
        "value": "42,5 м²"
      },
      {
        "label": "Этаж",
        "value": "5"
      },
      {
        "label": "Комнат",
        "value": "1"
      }
    ],
    "price": 8500000,
    "area": 42.5,
    "rooms": "1"
  },
  {
    "id": "26",
    "title": "Квартира №2",
    "url": "#apartment-26",
    "image": "assets/apartment-26.png",
    "details": [
      {
        "label": "Цена",
        "value": "6 200 000 ₽"
      },
      {
        "label": "Площадь",
        "value": "28 м²"
      },
      {
        "label": "Этаж",
        "value": "2"
      },
      {
        "label": "Комнат",
        "value": "Студия"
      }
    ],
    "price": 6200000,
    "area": 28.0,
    "rooms": "0"
  },
  {
    "id": "28",
    "title": "Квартира №3",
    "url": "#apartment-28",
    "image": "assets/apartment-28.png",
    "details": [
      {
        "label": "Цена",
        "value": "11 500 000 ₽"
      },
      {
        "label": "Площадь",
        "value": "64 м²"
      },
      {
        "label": "Этаж",
        "value": "7"
      },
      {
        "label": "Комнат",
        "value": "2"
      }
    ],
    "price": 11500000,
    "area": 64.0,
    "rooms": "2"
  },
  {
    "id": "30",
    "title": "Квартира №4",
    "url": "#apartment-30",
    "image": "assets/apartment-30.png",
    "details": [
      {
        "label": "Цена",
        "value": "15 800 000 ₽"
      },
      {
        "label": "Площадь",
        "value": "89,5 м²"
      },
      {
        "label": "Этаж",
        "value": "10"
      },
      {
        "label": "Комнат",
        "value": "3"
      }
    ],
    "price": 15800000,
    "area": 89.5,
    "rooms": "3"
  },
  {
    "id": "32",
    "title": "Квартира №5",
    "url": "#apartment-32",
    "image": "assets/apartment-32.png",
    "details": [
      {
        "label": "Цена",
        "value": "9 100 000 ₽"
      },
      {
        "label": "Площадь",
        "value": "46 м²"
      },
      {
        "label": "Этаж",
        "value": "3"
      },
      {
        "label": "Комнат",
        "value": "1"
      }
    ],
    "price": 9100000,
    "area": 46.0,
    "rooms": "1"
  }
];
    const endpoint = new URL('sp-preview-api', window.location.href);
    window.SevernyParkExperience = {
        endpoint: endpoint.href,
        favoritesUrl: new URL('favorites-preview-only', window.location.href).href,
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname) {
            return originalFetch(input, options);
        }
        if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const ids = (url.searchParams.get('ids') || '').split(',');
        return new Response(JSON.stringify(items.filter(item => ids.includes(item.id))), {
            status: 200, headers: {'Content-Type': 'application/json; charset=utf-8'},
        });
    };

    const form = document.getElementById('preview-filters');
    const list = document.querySelector('#catalog .wp-block-post-template');
    const cards = [...list.children];
    function filter() {
        const values = new FormData(form);
        const room = values.get('rooms');
        const min = Number(values.get('price_min') || 0);
        const max = values.get('price_max') === '' ? Infinity : Number(values.get('price_max'));
        const order = values.get('sort');
        const matches = items.filter(item => (room === '' || item.rooms === room) && item.price >= min && item.price <= max);
        if (order === 'price_asc') matches.sort((a, b) => a.price - b.price);
        if (order === 'price_desc') matches.sort((a, b) => b.price - a.price);
        if (order === 'area_desc') matches.sort((a, b) => b.area - a.area);
        const ids = matches.map(item => item.id);
        for (const card of cards) card.hidden = !ids.includes(card.dataset.previewId);
        for (const id of ids) list.append(cards.find(card => card.dataset.previewId === id));
        document.getElementById('preview-count').textContent = String(ids.length);
        document.getElementById('preview-empty').hidden = ids.length > 0;
    }
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    document.getElementById('preview-reset').addEventListener('click', event => {
        event.preventDefault(); form.reset(); filter();
    });
    function revealDetail(hash) {
        if (!/^#apartment-[1-9][0-9]*$/.test(hash)) return;
        const detail = document.getElementById(hash.slice(1));
        if (detail) detail.open = true;
    }
    document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const link = event.target.closest('a[href]');
        if (link) revealDetail(new URL(link.href, window.location.href).hash);
        // В WordPress каталог и избранное — отдельные страницы. Только здесь
        // синхронизируем их на одной странице предпросмотра после штатного скрипта.
        if (event.target.closest('.sp-favorite-toggle')) {
            window.setTimeout(() => {
                window.dispatchEvent(new StorageEvent('storage', {key: 'severny_park_favorites'}));
            }, 0);
        }
    });
    window.addEventListener('hashchange', () => revealDetail(window.location.hash));
    revealDetail(window.location.hash);
})();
