import { createWhatsappForm, parseWhatsapp, whatsappUrl } from './whatsapp-form';

describe('WhatsApp form', () => {
  it('reads supported existing chat links and decodes their message', () => {
    for (const url of [
      'https://wa.me/51987654321?text=Hola%20%26%20adi%C3%B3s',
      'https://api.whatsapp.com/send?phone=51987654321&text=Hola%20%26%20adi%C3%B3s',
    ]) {
      expect(parseWhatsapp(url)).toEqual({
        country: '51',
        code: '',
        phone: '987654321',
        message: 'Hola & adiós',
      });
    }
  });
  it('supports a custom country code and rejects invalid or oversized links', () => {
    const value = { country: 'other', code: '506', phone: '8888 7777', message: '' };
    expect(whatsappUrl(value)).toBe('https://wa.me/50688887777');
    expect(whatsappUrl({ ...value, phone: '+50688887777' })).toBeNull();
    expect(whatsappUrl({ ...value, message: 'a'.repeat(2048) })).toBeNull();
    expect(whatsappUrl({ ...value, phone: '1'.repeat(16) })).toBeNull();
  });
  it('does not interpret unrelated URLs as WhatsApp configurations', () => {
    for (const url of [
      'https://wa.me.evil.test/51987654321',
      'javascript:alert(1)',
      'http://wa.me/51987654321',
      'https://user:pass@wa.me/51987654321',
    ]) {
      expect(parseWhatsapp(url)).toBeNull();
    }
  });
  it('requires a phone and revalidates when the country changes', () => {
    const form = createWhatsappForm();
    expect(form.invalid).toBe(true);
    form.controls.phone.setValue('987654321');
    expect(form.valid).toBe(true);
    form.controls.country.setValue('other');
    expect(form.invalid).toBe(true);
    form.controls.code.setValue('506');
    expect(form.valid).toBe(true);
  });
});
