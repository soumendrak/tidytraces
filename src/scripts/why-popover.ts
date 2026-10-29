const buttons = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>('.why-info-button'));

function closeAll(except?: HTMLButtonElement) {
  for (const button of buttons()) if (button !== except) button.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.why-info-button') : null;
  closeAll(button ?? undefined);
  if (button) button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAll();
});
