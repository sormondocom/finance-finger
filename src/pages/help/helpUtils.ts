export function makeCard(icon: string, title: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'edu-card';
  card.innerHTML = `
    <div class="edu-card-icon">${icon}</div>
    <h3>${title}</h3>
  `;
  return card;
}
