export function canAccessAdmin(role: string) {
  return role.toLowerCase() === 'admin';
}

export function canAccessResellerApi(role: string) {
  return ['admin', 'reseller'].includes(role.toLowerCase());
}
