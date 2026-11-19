export const PHOTO_CAMERA_SCALE = 1.4;

export function createPhotoCameraIcon(number: number, group = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'photo-camera-marker';
  button.classList.toggle('is-group', group);
  button.style.setProperty('--photo-camera-scale', String(group ? 1 : PHOTO_CAMERA_SCALE));
  button.innerHTML = `
    <span class="photo-camera-dot" data-photo-map-circle aria-hidden="true"></span>
    <svg class="photo-camera-art" data-photo-map-card viewBox="0 0 96 96" fill="none" aria-hidden="true">
      ${group ? `
      <rect x="22" y="24" width="54" height="40" rx="6" transform="rotate(-10 49 44)" fill="#103e37" stroke="#fff7e6" stroke-width="3"/>
      <rect x="16" y="34" width="58" height="42" rx="6" fill="#287c68" stroke="#fff7e6" stroke-width="3"/>
      <circle cx="30" cy="46" r="4" fill="#fff7e6"/>
      <path d="m24 66 13-13 10 10 8-8 11 11" stroke="#fff7e6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="52" y="11" width="42" height="30" rx="15" fill="#4f46e5" stroke="#fff7e6" stroke-width="3"/>
      ` : `
      <path d="M25 29V25a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v4" fill="#ed7668" stroke="#fff7e6" stroke-width="3"/>
      <path class="photo-camera-outline" d="M23 29h14l4-7h14l5 7h12a9 9 0 0 1 9 9v26a9 9 0 0 1-9 9H55l-7 11-7-11H23a9 9 0 0 1-9-9V38a9 9 0 0 1 9-9Z" fill="#103e37" stroke="#fff7e6" stroke-width="3.5" stroke-linejoin="round"/>
      <path class="photo-camera-fill" d="M23 31h15l4-7h12l5 7h13a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H54l-6 10-6-10H23a7 7 0 0 1-7-7V38a7 7 0 0 1 7-7Z" fill="#287c68"/>
      <path d="M23 36h12" stroke="#8cd0b4" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="22" y="44" width="5" height="15" rx="2.5" fill="#0e463d"/>
      <circle cx="48" cy="49" r="18" fill="#103e37" stroke="#88c3ab" stroke-width="2"/>
      <circle cx="48" cy="49" r="13" fill="#244f50" stroke="#fff7e6" stroke-width="2.5"/>
      <g class="photo-camera-eye">
        <circle cx="49" cy="49" r="7" fill="#0b2428"/>
        <ellipse cx="44.5" cy="44.5" rx="3.5" ry="3" fill="#fffdf4"/>
        <circle cx="53" cy="53" r="1.8" fill="#a4e2d8"/>
      </g>
      <path d="M43 65q5 4 10 0" stroke="#fff7e6" stroke-width="2" stroke-linecap="round"/>
      <g fill="#f5a08b"><circle cx="27" cy="63" r="3"/><circle cx="69" cy="63" r="3"/></g>
      <circle cx="75" cy="26" r="15" fill="#ed7668" stroke="#fff7e6" stroke-width="3"/>
      `}
      <text x="${group ? 73 : 75}" y="31" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif" font-weight="800"></text>
    </svg>`;
  const text = button.querySelector('text')!;
  text.textContent = group ? `\u00d7${number}` : String(number);
  text.setAttribute('font-size', group
    ? text.textContent.length > 4 ? '10' : text.textContent.length > 3 ? '12' : '16'
    : text.textContent.length > 3 ? '10' : text.textContent.length > 2 ? '12' : '16');
  return button;
}
