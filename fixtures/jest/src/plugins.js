const registry = new Set(["alpha"]);

exports.register = (name) => registry.add(name);
exports.available = () => [...registry].sort();
