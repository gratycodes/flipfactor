// Bug: no explicit locale, so the separators follow LC_ALL / LANG.
exports.formatPrice = (amount) => amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
