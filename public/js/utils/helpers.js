export function formatPrice(amount, currencySymbol = '₡') {
    return `${currencySymbol}${amount.toLocaleString()}`;
}

export function calculatePriceWithTax(product) {
    const basePrice = product.price?.[0]?.price || 0;
    let taxRate = 0;
    
    if (product.tax && product.tax.length > 0) {
        taxRate = product.tax.reduce((total, t) => total + (t.percentage || 0), 0);
    }
    
    const taxAmount = (basePrice * taxRate) / 100;
    return {
        basePrice,
        taxRate,
        finalPrice: Math.round(basePrice + taxAmount)
    };
}

export function formatDate(dateString) {
    if (!dateString) return 'Desconocida';
    const date = new Date(dateString);
    return date.toLocaleString();
}
