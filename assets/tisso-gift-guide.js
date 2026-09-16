/* Vanilla custom elements reconnect automatically after Shopify editor section reloads. */
(() => {
  class TissoBanner extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      const toggle = this.querySelector('.tisso-menu-toggle');
      const menu = this.querySelector('.tisso-mobile-menu');
      const close = () => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      };
      this.addEventListener('click', (event) => {
        if (event.target.closest('.tisso-menu-toggle')) {
          menu.hidden = !menu.hidden;
          toggle.setAttribute('aria-expanded', String(!menu.hidden));
          toggle.setAttribute('aria-label', menu.hidden ? 'Open menu' : 'Close menu');
        } else if (event.target.closest('a')) close();
      }, { signal: this.abort.signal });
      this.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) { close(); toggle.focus(); }
      }, { signal: this.abort.signal });
    }
    disconnectedCallback() { this.abort?.abort(); }
  }

  class TissoGrid extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.dialog = this.querySelector('dialog');
      this.form = this.querySelector('form');
      this.optionsElement = this.querySelector('.tisso-options');
      this.status = this.querySelector('.tisso-status');
      this.addButton = this.querySelector('.tisso-add');
      this.addLabel = this.querySelector('[data-add-label]');
      this.products = new Map();
      this.querySelectorAll('[data-product-json]').forEach((node) => {
        this.products.set(node.dataset.productJson, JSON.parse(node.textContent));
      });
      this.addEventListener('click', (event) => {
        const hotspot = event.target.closest('[data-product-key]');
        if (hotspot) this.openProduct(hotspot);
        if (event.target.closest('.tisso-close')) this.dialog.close();
      }, { signal });
      this.dialog.addEventListener('click', (event) => {
        // The native backdrop targets the dialog; clicks inside its rectangle stay open.
        const rect = this.dialog.getBoundingClientRect();
        if (event.target === this.dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) this.dialog.close();
      }, { signal });
      this.dialog.addEventListener('close', () => {
        if (!document.querySelector('.tisso-dialog[open]')) document.documentElement.classList.remove('tisso-modal-open');
        this.opener?.focus();
      }, { signal });
      this.form.addEventListener('change', (event) => {
        const index = Number(event.target.dataset.optionIndex);
        if (!Number.isInteger(index)) return;
        this.selection[index] = event.target.value;
        this.status.textContent = '';
        this.refreshVariant();
      }, { signal });
      this.form.addEventListener('submit', (event) => { event.preventDefault(); this.addToCart(); }, { signal });
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.dialog?.close();
      if (!document.querySelector('.tisso-dialog[open]')) document.documentElement.classList.remove('tisso-modal-open');
    }

    openProduct(hotspot) {
      // Do not switch product while a cart request is in flight.
      if (this.busy) return;
      this.product = this.products.get(hotspot.dataset.productKey);
      if (!this.product) return;
      this.opener = hotspot;
      this.querySelector('.tisso-popup-title').textContent = this.product.title;
      this.querySelector('.tisso-popup-description').textContent = this.product.description;
      this.status.textContent = '';
      this.optionsElement.replaceChildren();
      const first = this.product.variants.find((variant) => variant.available) || this.product.variants[0];
      this.selection = this.product.options.map(() => '');
      if (!this.product.hasDefaultVariant) {
        this.product.options.forEach((option, index) => {
          const name = option.name;
          const values = option.values.map((value) => typeof value === 'string' ? value : value.name);
          const isColor = /^(color|colour)$/i.test(name.trim());
          const field = document.createElement('fieldset');
          field.className = 'tisso-option';
          const legend = document.createElement('legend');
          legend.textContent = name;
          field.append(legend);
          if (isColor) {
            this.selection[index] = first?.options[index] || '';
            const colors = document.createElement('div');
            colors.className = 'tisso-colors';
            values.forEach((value) => {
              const label = document.createElement('label');
              label.className = 'tisso-color';
              const input = document.createElement('input');
              input.type = 'radio';
              input.name = `${this.id}-option-${index}`;
              input.value = value;
              input.dataset.optionIndex = index;
              input.checked = this.selection[index] === value;
              const text = document.createElement('span');
              text.textContent = value;
              if (CSS.supports('color', value)) text.style.setProperty('--swatch', value);
              label.append(input, text);
              colors.append(label);
            });
            field.append(colors);
          } else {
            const wrap = document.createElement('div');
            wrap.className = 'tisso-select-wrap';
            const select = document.createElement('select');
            select.dataset.optionIndex = index;
            select.setAttribute('aria-label', name);
            select.required = true;
            select.add(new Option(`Choose your ${name.toLowerCase()}`, ''));
            values.forEach((value) => select.add(new Option(value, value)));
            wrap.append(select);
            field.append(wrap);
          }
          this.optionsElement.append(field);
        });
      }
      this.refreshVariant();
      this.dialog.showModal();
      document.documentElement.classList.add('tisso-modal-open');
    }

    refreshVariant() {
      const variants = this.product.variants;
      // Only preceding options constrain a control, so a color can always be changed.
      this.product.options.forEach((option, index) => {
        const available = (value) => variants.some((variant) => variant.available && variant.options[index] === value && this.selection.every((chosen, prior) => prior >= index || !chosen || variant.options[prior] === chosen));
        if (this.selection[index] && !available(this.selection[index])) this.selection[index] = '';
        this.optionsElement.querySelectorAll(`[data-option-index="${index}"]`).forEach((control) => {
          if (control.tagName === 'SELECT') {
            control.disabled = Boolean(this.busy);
            Array.from(control.options).forEach((item) => { item.disabled = Boolean(item.value) && !available(item.value); });
            control.value = this.selection[index];
          } else {
            control.disabled = Boolean(this.busy) || !available(control.value);
            control.checked = this.selection[index] === control.value;
          }
        });
      });
      this.variant = this.product.hasDefaultVariant ? variants[0] : variants.find((variant) => variant.options.every((value, index) => value === this.selection[index]));
      const preview = this.variant || variants.find((variant) => variant.available && variant.options.every((value, index) => !this.selection[index] || value === this.selection[index])) || variants[0];
      this.querySelector('.tisso-popup-price').textContent = preview?.price || '';
      const image = this.querySelector('.tisso-popup-image');
      image.src = preview?.image || this.product.image;
      image.alt = this.product.title;
      this.addButton.disabled = this.busy || !this.variant?.available;
      this.addLabel.textContent = this.busy ? 'ADDING…' : this.variant && !this.variant.available ? 'SOLD OUT' : 'ADD TO CART';
      if (!variants.some((variant) => variant.available)) this.status.textContent = 'This product is sold out.';
    }

    async addToCart() {
      if (this.busy || !this.variant?.available) return;
      const selectedVariant = this.variant;
      const normalized = selectedVariant.options.map((value) => value.trim().toLowerCase());
      const needsJacket = normalized.includes('black') && normalized.includes('medium');
      const items = [{ id: selectedVariant.id, quantity: 1 }];
      if (needsJacket) {
        const bonusId = Number(this.dataset.bonusId);
        if (!bonusId || this.dataset.bonusAvailable !== 'true') {
          this.status.textContent = 'The accompanying Soft Winter Jacket is unavailable. Please contact the store.';
          return;
        }
        if (bonusId === selectedVariant.id) items[0].quantity += 1;
        else items.push({ id: bonusId, quantity: 1 });
      }
      this.busy = true;
      this.form.setAttribute('aria-busy', 'true');
      this.status.textContent = '';
      this.refreshVariant();
      this.optionsElement.querySelectorAll('input, select').forEach((control) => { control.disabled = true; });
      try {
        // One locale-aware Shopify request contains both actual variant IDs.
        const response = await fetch(this.dataset.cartAdd, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items })
        });
        const result = await response.json();
        if (!response.ok || result.status >= 400) throw new Error(result.description || result.message || 'Unable to add this product. Please try again.');
        // The cart page displays authoritative totals without depending on a theme drawer.
        window.location.assign(this.dataset.cartUrl);
      } catch (error) {
        this.status.textContent = error.message || 'Unable to add this product. Please try again.';
      } finally {
        this.busy = false;
        this.form.setAttribute('aria-busy', 'false');
        this.refreshVariant();
      }
    }
  }
  if (!customElements.get('tisso-banner')) customElements.define('tisso-banner', TissoBanner);
  if (!customElements.get('tisso-grid')) customElements.define('tisso-grid', TissoGrid);
})();
