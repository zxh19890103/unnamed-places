export function createPhotoFootprintIcon(): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = 'photo-location-footprint';
  element.setAttribute('aria-hidden', 'true');
  const footprint = `
    <path d="M30 28C20 25 10 33 10 44C10 54 20 60 18 70C17 76 12 80 13 86C14 92 21 94 26 91C32 87 32 80 35 72L42 57C46 51 49 47 47 41C44 34 38 30 30 28Z"/>
    <ellipse cx="23" cy="15" rx="6.5" ry="9" transform="rotate(-20 23 15)"/>
    <ellipse cx="38" cy="17" rx="5.2" ry="7" transform="rotate(20 38 17)"/>
    <ellipse cx="48" cy="24" rx="4.3" ry="5.9" transform="rotate(31 48 24)"/>
    <ellipse cx="55" cy="33" rx="3.6" ry="5" transform="rotate(35 55 33)"/>
    <ellipse cx="58" cy="43" rx="3" ry="4" transform="rotate(40 58 43)"/>`;
  element.innerHTML = `
    <svg width="100%" height="100%" viewBox="-2 -2 68 100" fill="none" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="#242426" stroke-width="18">${footprint}</g>
      <g stroke="currentColor" stroke-width="4.4">${footprint}</g>
    </svg>`;
  return element;
}
