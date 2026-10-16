// The message for the driver when a vehicle is assigned. The Admin can edit it,
// then send it on WhatsApp (opens WhatsApp with the text ready) or copy it.

const COUNTRY_CODE = '94'; // change this if your drivers' numbers use another country code

// "0771234567", "+94 77 123 4567" or "771234567"  ->  "94771234567" (what WhatsApp links need)
export function phoneForWhatsApp(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = COUNTRY_CODE + d.slice(1);
  else if (d.length === 9) d = COUNTRY_CODE + d;
  return d;
}

export function whatsappLink(phone, text) {
  const n = phoneForWhatsApp(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}

export function driverMessage(db, r) {
  const t = r.trip;
  const driver = db.drivers.find((d) => d.id === t.driverId);
  const vehicle = db.vehicles.find((v) => v.id === t.vehicleId);
  const who = db.users.find((u) => u.id === r.userId);
  const when = (s) => String(s).replace('T', ' ');
  return [
    `Hello ${driver?.name || ''},`,
    '',
    'You have been assigned a trip.',
    `Request: ${r.id}`,
    `Vehicle: ${vehicle?.number || ''}${vehicle ? ` (${vehicle.type})` : ''}`,
    `Date and time: ${when(t.start)} to ${when(t.end)}`,
    `From: ${t.from}`,
    `To: ${t.to}`,
    `Passengers: ${t.passengers}`,
    `Purpose: ${t.purpose}`,
    `Requested by: ${who?.name || ''}${r.dept ? `, ${r.dept}` : ''}`,
    '',
    'Please reply to confirm.',
  ].join('\n');
}