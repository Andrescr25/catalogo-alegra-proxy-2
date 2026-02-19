import { calculatePriceWithTax } from '../utils/helpers.js';
import { state } from '../core/state.js';

export function createProductCard(product) {
    const isHidden = state.hiddenProducts.has(product.id);
    const priceInfo = calculatePriceWithTax(product);
    const currency = product.price?.[0]?.currency?.symbol || '₡';
    const stock = product.inventory?.availableQuantity || 0;
    
    const card = document.createElement('div');
    card.className = `product-card ${isHidden ? 'hidden' : ''}`;
    card.setAttribute('data-product-id', product.id);

    let stockClass = 'stock-out';
    let stockText = 'Sin stock';
    
    if (stock > 10) {
        stockClass = 'stock-available';
        stockText = `${stock} disponibles`;
    } else if (stock > 0) {
        stockClass = 'stock-low';
        stockText = `${stock} disponibles`;
    }

    let imageHtml = `<div class="product-image-placeholder">📦 ${product.name.substring(0, 20)}...</div>`;
    
    if (product.images && product.images.length > 0) {
        const favoriteImage = product.images.find(img => img.favorite === true) || product.images[0];
        if (favoriteImage && favoriteImage.url) {
            imageHtml = `
                <div class="product-image-wrapper">
                    <img class="product-image" 
                         loading="lazy"
                         src="${favoriteImage.url}" 
                         alt="${product.name}"
                         onerror="this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'>📦</div>'">
                </div>
            `;
        }
    }

    let priceBreakdown = '';
    if (priceInfo.taxRate > 0) {
        priceBreakdown = `<div class="product-price-breakdown">Base: ${currency}${priceInfo.basePrice.toLocaleString()} + ${priceInfo.taxRate}%</div>`;
    }

    card.innerHTML = `
        ${isHidden ? '<div class="hidden-indicator">Oculto</div>' : ''}
        <div class="product-image-container">${imageHtml}</div>
        <div class="product-info">
            <div class="product-name">${product.name}</div>
            <div class="product-reference">Ref: ${product.reference?.reference || 'N/A'}</div>
            <div class="product-price">${currency}${priceInfo.finalPrice.toLocaleString()}</div>
            ${priceBreakdown}
            <div class="product-stock ${stockClass}">${stockText}</div>
        </div>
    `;

    return card;
}

export function createCategorySection(name, count) {
    const div = document.createElement('div');
    div.className = 'category-section';
    div.setAttribute('data-category', name);
    div.innerHTML = `
        <div class="category-title">
            <span class="category-name">${name}</span>
            <span class="category-count">${count}</span>
        </div>
        <div class="products-grid"></div>
    `;
    return div;
}

export function showBanner(message, type = 'info', duration = 3000) {
    const banner = document.createElement('div');
    banner.className = `banner banner-${type}`; // Asumimos estilos CSS existentes o genéricos
    banner.style.cssText = `
        position: fixed; top: 80px; right: 20px; 
        background: ${type === 'error' ? '#f8d7da' : '#d1ecf1'}; 
        color: ${type === 'error' ? '#721c24' : '#0c5460'};
        padding: 10px; border-radius: 5px; z-index: 1000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    banner.textContent = message;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), duration);
}
