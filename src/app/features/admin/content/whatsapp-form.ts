import { AbstractControl, FormControl, FormGroup } from '@angular/forms';

export const whatsappCountries = [
  { code: '51', name: 'Perú (+51)' },
  { code: '54', name: 'Argentina (+54)' },
  { code: '591', name: 'Bolivia (+591)' },
  { code: '55', name: 'Brasil (+55)' },
  { code: '56', name: 'Chile (+56)' },
  { code: '57', name: 'Colombia (+57)' },
  { code: '593', name: 'Ecuador (+593)' },
  { code: '34', name: 'España (+34)' },
  { code: '1', name: 'Estados Unidos / Canadá (+1)' },
  { code: '52', name: 'México (+52)' },
  { code: '595', name: 'Paraguay (+595)' },
  { code: '598', name: 'Uruguay (+598)' },
  { code: '58', name: 'Venezuela (+58)' },
];

export function whatsappUrl(value: {
  country: string;
  code: string;
  phone: string;
  message: string;
}): string | null {
  const code = value.country === 'other' ? value.code : value.country;
  if (!/^[1-9]\d{0,2}$/.test(code) || !/^[\d\s()-]+$/.test(value.phone)) return null;
  const phone = code + value.phone.replace(/[\s()-]/g, '');
  if (!/^[1-9]\d{6,14}$/.test(phone)) return null;
  const url = `https://wa.me/${phone}`;
  const result = value.message ? `${url}?text=${encodeURIComponent(value.message)}` : url;
  return result.length <= 2048 ? result : null;
}

export function createWhatsappForm() {
  return new FormGroup(
    {
      country: new FormControl('51', { nonNullable: true }),
      code: new FormControl('', { nonNullable: true }),
      phone: new FormControl('', { nonNullable: true }),
      message: new FormControl('', { nonNullable: true }),
      is_visible: new FormControl(false, { nonNullable: true }),
    },
    {
      validators: (control: AbstractControl) =>
        whatsappUrl(control.value) ? null : { whatsapp: true },
    },
  );
}

export function parseWhatsapp(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port)
      return null;
    const phone =
      parsed.hostname === 'wa.me'
        ? parsed.pathname.replace(/^\/|\/$/g, '')
        : ['api.whatsapp.com', 'web.whatsapp.com', 'www.whatsapp.com'].includes(parsed.hostname) &&
            parsed.pathname === '/send'
          ? (parsed.searchParams.get('phone') ?? '')
          : '';
    if (!/^[1-9]\d{6,14}$/.test(phone)) return null;
    const country = [...whatsappCountries]
      .sort((a, b) => b.code.length - a.code.length)
      .find((item) => phone.startsWith(item.code));
    return {
      country: country?.code ?? 'other',
      code: '',
      phone: country ? phone.slice(country.code.length) : phone,
      message: parsed.searchParams.get('text') ?? '',
    };
  } catch {
    return null;
  }
}
