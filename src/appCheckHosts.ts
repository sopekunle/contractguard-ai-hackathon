function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.');
  if (octets.length !== 4 || !octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)) {
    return false;
  }
  const [first, second] = octets.map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function appCheckDebugStatus(
  hostname: string,
  secureHttps: boolean,
  enabled: string | undefined,
  lanHosts: string | undefined,
): 'enabled' | 'disabled' | 'host-not-allowed' | 'https-required' {
  if (!['1', 'true', 'yes', 'on'].includes(enabled?.trim().toLowerCase() ?? '')) return 'disabled';
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'enabled';
  if (!isPrivateIpv4(hostname) || !lanHosts?.split(',').some((entry) => entry.trim() === hostname)) {
    return 'host-not-allowed';
  }
  return secureHttps ? 'enabled' : 'https-required';
}
