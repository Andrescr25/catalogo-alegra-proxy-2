import React from 'react';
import { useAppContext } from '../core/AppContext';

export const ProductCard = ({ product }) => {
    const { isAdminMode } = useAppContext();
    const isHidden = false; // Simplified for now, can add logic if needed

    // Generate image HTML (same logic as before)
    let imageUrl = '/color2.png'; // Fallback
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
    let stockText = `${availableQuantity} disponibles`;

    if (availableQuantity <= 0) {
        stockClass = 'stock-out';
        stockText = 'Agotado';
    } else if (availableQuantity <= 5) {
        stockClass = 'stock-low';
        stockText = `¡Solo ${availableQuantity} disponibles!`;
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
                    onError={(e) => { e.target.onerror = null; e.target.src = '/color2.png'; }}
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
