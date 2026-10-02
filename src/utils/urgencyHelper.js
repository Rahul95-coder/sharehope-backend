const getUrgency = (expiryDateTime) => {
  if (!expiryDateTime) return 'NORMAL';
  const now = new Date();
  const expiry = new Date(expiryDateTime);
  const diffMs = expiry - now;
  if (diffMs <= 0) return 'EXPIRED';
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 2) return 'CRITICAL';
  if (diffHours <= 6) return 'URGENT';
  return 'NORMAL';
};

module.exports = { getUrgency };
