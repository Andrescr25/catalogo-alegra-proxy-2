import { state } from '../core/state.js';
import { createCategorySection, createProductCard } from './components.js';
import { config } from '../config.js';

class Renderer {
    constructor() {
        this.contentCtx = document.getElementById('content');
        this.renderedCount = 0;
    }

    clear() {
        this.contentCtx.innerHTML = '';
        this.renderedCount = 0;
    }

    renderInitial() {
        this.clear();
        if (state.visibleProducts.length === 0) {
            this.contentCtx.innerHTML = '<div class="info-banner"><p>No se encontraron productos.</p></div>';
            return;
        }
        this.renderNextBatch();
    }

    renderNextBatch() {
        if (this.renderedCount >= state.visibleProducts.length) return;

        const start = this.renderedCount;
        const end = start + config.batchSize;
        let currentIdx = 0;

        for (const [categoryName, products] of state.categories) {
            if (currentIdx + products.length < start) {
                currentIdx += products.length;
                continue;
            }
            if (currentIdx > end) break;

            let section = this.contentCtx.querySelector(`[data-category="${categoryName}"]`);
            if (!section) {
                section = createCategorySection(categoryName, products.length);
                this.contentCtx.appendChild(section);
            } else {
                const countSpan = section.querySelector('.category-count');
                if (countSpan) countSpan.textContent = products.length;
            }

            const grid = section.querySelector('.products-grid');

            products.forEach(product => {
                if (currentIdx >= start && currentIdx < end) {
                    if (!grid.querySelector(`[data-product-id="${product.id}"]`)) {
                        grid.appendChild(createProductCard(product));
                    }
                }
                currentIdx++;
            });
        }
        this.renderedCount = Math.min(end, state.visibleProducts.length);
    }
    
    updateCategoryCounts() {
        for (const [name, products] of state.categories) {
            const section = this.contentCtx.querySelector(`[data-category="${name}"]`);
            if (section) {
                const count = section.querySelector('.category-count');
                if (count) count.textContent = products.length;
            }
        }
    }

    showError(message) {
        this.clear();
        this.contentCtx.innerHTML = `
            <div class="error">
                <h3>⚠️ Atuación Requerida</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">Reintentar</button>
            </div>
        `;
    }
}

export const renderer = new Renderer();
