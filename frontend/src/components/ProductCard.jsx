import React from 'react';
import { useAppContext } from '../core/AppContext';

export const ProductCard = ({ product }) => {
    const { isAdminMode } = useAppContext();
    const isHidden = false; // Simplified for now, can add logic if needed

    // Fallback simple gris
    const placeholderImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f0f0f0"/><path d="M70,90 l20,20 l40,-40" stroke="%23cccccc" stroke-width="8" fill="none"/></svg>';

    let imageUrl = placeholderImg;
    if (product.images && product.images.length > 0) {
        const favoriteImage = product.images.find(img => img.favorite === true) || product.images[0];
        if (favoriteImage && favoriteImage.url) {
            imageUrl = favoriteImage.url;
        }
    }

    // Price calculation
    const priceList = product.price && product.price.length > 0 ? product.price[0] : null;
    let priceAmount = 0;
    const currency = '₡';

    if (priceList && priceList.price) {
        priceAmount = typeof priceList.price === 'string'
            ? parseFloat(priceList.price.replace(/,/g, ''))
            : parseFloat(priceList.price);
    }

    const taxes = product.tax || [];
    let totalTaxPercentage = 0;
    taxes.forEach(tax => { if (tax.percentage) totalTaxPercentage += parseFloat(tax.percentage); });

    const taxAmount = priceAmount * (totalTaxPercentage / 100);
    const finalPrice = priceAmount + taxAmount;

    // Stock calculation
    const inventory = product.inventory || {};
    let availableQuantity = 0;
    if (inventory.warehouses && inventory.warehouses.length > 0) {
        inventory.warehouses.forEach(w => {
            if (w.availableQuantity) availableQuantity += parseFloat(w.availableQuantity);
        });
    }

    let stockClass = 'stock-in';
    let stockText = `${availableQuantity} disp.`;

    if (availableQuantity <= 0) {
        stockClass = 'stock-out';
        stockText = 'Agotado';
    } else if (availableQuantity <= 5) {
        stockClass = 'stock-low';
        stockText = `¡Solo ${availableQuantity}!`;
    }

    return (
        <div className={`product-card ${isAdminMode && isHidden ? 'hidden-item' : ''}`}>
            {isHidden && isAdminMode && <div className="hidden-indicator">Oculto</div>}

            <div className="product-image-container">
                <img
                    src={imageUrl}
                    alt={product.name}
                    className="product-image"
                    loading="lazy"
                    onError={(e) => { e.target.onerror = null; e.target.src = placeholderImg; }}
                />
            </div>

            <div className="product-info">
                <div>
                    <div className="product-name" title={product.name}>{product.name}</div>
                    <div className="product-reference">Ref: {product.reference?.reference || 'N/A'}</div>
                </div>

                <div className="product-footer">
                    <div className="product-price">{currency}{finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    {totalTaxPercentage > 0 && <div className="product-tax">Incluye {totalTaxPercentage}% IVA</div>}
                    <div className={`product-stock ${stockClass}`}>{stockText}</div>
                </div>
            </div>
        </div>
    );
};
